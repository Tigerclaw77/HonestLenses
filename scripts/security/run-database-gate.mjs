import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  initdb,
  pg_ctl as pgCtl,
} from "@embedded-postgres/windows-x64";

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const fixturePath = path.join(
  repositoryRoot,
  "supabase",
  "validation",
  "0000_legacy_security_fixture.sql",
);
const migrationDirectory = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
);
const deploymentPackageSqlDirectory = path.join(
  repositoryRoot,
  "docs",
  "production-deployment",
  "sql",
);
const commerceReversePath = path.join(
  deploymentPackageSqlDirectory,
  "commerce-v2-schema-reverse.sql",
);
const commerceTables = [
  "orders",
  "order_items",
  "payments",
  "payment_events",
  "payment_event_inbox",
  "payment_operations",
  "prescription_verifications",
  "prescription_verification_events",
  "fulfillments",
  "fulfillment_events",
  "order_adjustments",
  "order_events",
  "reconciliation_runs",
  "reconciliation_findings",
  "legacy_imports",
];
const postgresBinDirectory = path.dirname(initdb);
const processEnvironment = {
  ...process.env,
  PATH: `${postgresBinDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasPinnedSearchPath(configuration) {
  return (
    Array.isArray(configuration) &&
    configuration.some((entry) => entry.startsWith("search_path="))
  );
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: processEnvironment,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    // PostgreSQL's Windows launcher can leave inherited pipe handles open in
    // the database server after pg_ctl itself exits. Resolve on the process
    // exit event so the harness does not wait for unrelated inherited handles.
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${path.basename(command)} exited ${code}\n${stdout}\n${stderr}`.trim(),
        ),
      );
    });
  });
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Unable to allocate a local PostgreSQL port"));
      });
    });
  });
}

async function setRole(client, role, userId = null) {
  await client.query(`set local role ${role}`);
  if (userId) {
    await client.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [userId],
    );
  }
}

async function queryAs(client, role, sql, values = [], userId = null) {
  await client.query("begin");
  try {
    await setRole(client, role, userId);
    const result = await client.query(sql, values);
    await client.query("rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function executeAs(client, role, sql, values = [], userId = null) {
  await client.query("begin");
  try {
    await setRole(client, role, userId);
    const result = await client.query(sql, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function expectDenied(
  client,
  role,
  sql,
  values = [],
  userId = null,
) {
  try {
    await queryAs(client, role, sql, values, userId);
  } catch (error) {
    assert(
      ["42501", "42P01", "42883"].includes(error?.code),
      `${role} failed for an unexpected reason: ${error?.message}`,
    );
    return;
  }
  throw new Error(`${role} unexpectedly succeeded: ${sql}`);
}

async function expectDatabaseError(
  client,
  role,
  sql,
  expectedCode,
  values = [],
) {
  try {
    await queryAs(client, role, sql, values);
  } catch (error) {
    assert(
      error?.code === expectedCode,
      `Expected PostgreSQL ${expectedCode}, received ${error?.code}: ${error?.message}`,
    );
    return;
  }
  throw new Error(`Expected PostgreSQL ${expectedCode}: ${sql}`);
}

async function applySqlFile(client, filePath, migration = null) {
  const sql = await readFile(filePath, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    if (migration) {
      await client.query(
        `
          insert into supabase_migrations.schema_migrations (
            version,
            name,
            statements
          )
          values ($1, $2, $3::text[])
        `,
        [migration.version, migration.name, [sql]],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  return {
    file: path.basename(filePath),
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}

function findSelectResult(result) {
  const results = Array.isArray(result) ? result : [result];
  return [...results].reverse().find((entry) => entry?.command === "SELECT");
}

async function runReadOnlyPackageSql(client, fileName) {
  const sql = await readFile(
    path.join(deploymentPackageSqlDirectory, fileName),
    "utf8",
  );
  const result = await client.query(sql);
  const selectResult = findSelectResult(result);
  assert(selectResult, `${fileName} did not return a SELECT result`);
  return selectResult;
}

async function expectCommerceReverseRefusal(client, sql, expectedTables) {
  try {
    await client.query(sql);
  } catch (error) {
    await client.query("rollback");
    assert(
      error?.code === "55000",
      `Commerce reverse failed with unexpected SQLSTATE ${error?.code}: ${error?.message}`,
    );
    for (const table of expectedTables) {
      assert(
        error.message.includes(`commerce_v2.${table}`),
        `Commerce reverse did not report populated table commerce_v2.${table}`,
      );
    }
    const schemas = await client.query(`
      select
        to_regnamespace('commerce_v2') is not null as commerce_exists,
        to_regnamespace('legacy_archive') is not null as archive_exists
    `);
    assert(
      schemas.rows[0]?.commerce_exists && schemas.rows[0]?.archive_exists,
      "Commerce reverse refusal did not preserve both schemas",
    );
    return;
  }
  throw new Error("Commerce reverse unexpectedly dropped a populated schema");
}

async function testCommerceReverse(client, connectionConfig) {
  const sql = await readFile(commerceReversePath, "utf8");
  assert(
    !/pg_stat_(?:user|all)_tables|n_live_tup/i.test(sql),
    "Commerce reverse must not rely on estimated PostgreSQL statistics",
  );
  for (const table of commerceTables) {
    assert(
      sql.includes(`exists (select 1 from commerce_v2.${table})`),
      `Commerce reverse does not exactly check commerce_v2.${table}`,
    );
  }

  await client.query(`
    truncate table ${commerceTables
      .map((table) => `commerce_v2.${table}`)
      .join(",\n      ")}
    restart identity cascade
  `);

  await client.query(`
    insert into commerce_v2.reconciliation_runs (run_status)
    values ('running')
  `);
  await expectCommerceReverseRefusal(client, sql, ["reconciliation_runs"]);
  await client.query("truncate table commerce_v2.reconciliation_runs cascade");

  await client.query(`
    insert into commerce_v2.reconciliation_runs (run_status)
    values ('running');
    insert into commerce_v2.legacy_imports (
      legacy_schema,
      legacy_table,
      legacy_id,
      v2_table,
      v2_id,
      import_status
    )
    values (
      'public',
      'orders',
      'rollback-test',
      'orders',
      gen_random_uuid(),
      'warning'
    );
  `);
  await expectCommerceReverseRefusal(
    client,
    sql,
    ["reconciliation_runs", "legacy_imports"],
  );
  await client.query(`
    truncate table
      commerce_v2.legacy_imports,
      commerce_v2.reconciliation_runs
    cascade
  `);

  const lockStatement = sql.match(
    /lock table[\s\S]+?in access exclusive mode;/i,
  )?.[0];
  assert(lockStatement, "Commerce reverse ACCESS EXCLUSIVE lock is missing");

  const concurrentWriter = new Client(connectionConfig);
  await concurrentWriter.connect();
  try {
    await client.query("begin");
    await client.query(lockStatement);
    await concurrentWriter.query("begin");
    await concurrentWriter.query("set local lock_timeout = '250ms'");
    try {
      await concurrentWriter.query(`
        insert into commerce_v2.reconciliation_runs (run_status)
        values ('running')
      `);
      throw new Error(
        "Concurrent Commerce insert unexpectedly bypassed rollback locks",
      );
    } catch (error) {
      assert(
        error?.code === "55P03",
        `Concurrent Commerce insert failed unexpectedly: ${error?.message}`,
      );
    } finally {
      await concurrentWriter.query("rollback").catch(() => {});
      await client.query("rollback");
    }
  } finally {
    await concurrentWriter.end();
  }

  await client.query(sql);
  const schemas = await client.query(`
    select
      to_regnamespace('commerce_v2') is null as commerce_absent,
      to_regnamespace('legacy_archive') is null as archive_absent
  `);
  assert(
    schemas.rows[0]?.commerce_absent && schemas.rows[0]?.archive_absent,
    "Commerce reverse did not drop both empty schemas",
  );

  return {
    exactTablesChecked: commerceTables.length,
    emptySchemasDropped: true,
    onePopulatedTableRefused: true,
    multiplePopulatedTablesRefused: true,
    concurrentInsertBlocked: true,
  };
}

async function runGate(client, connectionConfig) {
  const applied = [];
  await client.query(`
    create extension if not exists pgcrypto;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text not null,
      statements text[] not null
    );
  `);
  applied.push(await applySqlFile(client, fixturePath));

  const exposedRead = await queryAs(
    client,
    "anon",
    "select count(*)::integer as count from public.admin_orders",
  );
  assert(
    exposedRead.rows[0]?.count === 3,
    "Pre-remediation admin view was not anonymously readable",
  );

  const exposedUpdate = await queryAs(
    client,
    "anon",
    "update public.admin_orders set status = 'captured' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning status",
  );
  assert(
    exposedUpdate.rowCount === 1 &&
      exposedUpdate.rows[0]?.status === "captured",
    "Pre-remediation admin view was not anonymously updatable",
  );

  const migrations = [
    {
      file: "20260721143337_resend_email_delivery_tracking.sql",
      version: "20260721143337",
      name: "resend_email_delivery_tracking",
    },
    {
      file: "20260729144510_create_commerce_v2_phase1.sql",
      version: "20260729144510",
      name: "create_commerce_v2_phase1",
    },
    {
      file: "20260729160750_security_remediation_least_privilege.sql",
      version: "20260729160750",
      name: "security_remediation_least_privilege",
    },
  ];
  for (const [index, migration] of migrations.entries()) {
    applied.push(
      await applySqlFile(
        client,
        path.join(migrationDirectory, migration.file),
        migration,
      ),
    );
    if (index === 0) {
      const preMigrationAssertions = await runReadOnlyPackageSql(
        client,
        "pre-migration-assertions.sql",
      );
      assert(
        preMigrationAssertions.rows.length === 12,
        "Pre-migration preparation SQL did not return 12 checks",
      );
      assert(
        preMigrationAssertions.rows.every((row) =>
          ["PASS", "FAIL"].includes(row.status),
        ),
        "Pre-migration preparation SQL returned an invalid status",
      );
      const rollbackRows = await runReadOnlyPackageSql(
        client,
        "rollback-recovery-rows.sql",
      );
      assert(
        rollbackRows.rows.length === 1,
        "Rollback recovery export did not return one document",
      );
    }
  }

  const postMigrationAssertions = await runReadOnlyPackageSql(
    client,
    "post-migration-assertions.sql",
  );
  assert(
    postMigrationAssertions.rows.length === 12,
    "Post-migration preparation SQL did not return 12 checks",
  );
  const failedPostMigrationAssertions = postMigrationAssertions.rows.filter(
    (row) => row.status !== "PASS",
  );
  assert(
    failedPostMigrationAssertions.length === 0,
    `Post-migration preparation SQL failed: ${JSON.stringify(
      failedPostMigrationAssertions,
    )}`,
  );
  const catalogExport = await runReadOnlyPackageSql(
    client,
    "production-catalog-export.sql",
  );
  assert(
    catalogExport.rows.length === 1 && catalogExport.rows[0]?.catalog,
    "Production catalog export did not return one catalog document",
  );
  const migrationLedger = await runReadOnlyPackageSql(
    client,
    "migration-ledger-export.sql",
  );
  const migrationLedgerDocument =
    migrationLedger.rows[0]?.jsonb_build_object;
  assert(
    migrationLedger.rows.length === 1 &&
      migrationLedgerDocument?.transaction_read_only === "on" &&
      migrationLedgerDocument?.migrations?.length === 3,
    "Migration ledger export did not return the expected read-only document",
  );
  const writeDrainObservation = await runReadOnlyPackageSql(
    client,
    "write-drain-observation.sql",
  );
  const writeDrainDocument =
    writeDrainObservation.rows[0]?.jsonb_build_object;
  assert(
    writeDrainObservation.rows.length === 1 &&
      writeDrainDocument?.transaction_read_only === "on" &&
      Array.isArray(writeDrainDocument?.active_writer_transactions) &&
      Array.isArray(writeDrainDocument?.prepared_transactions) &&
      Array.isArray(writeDrainDocument?.write_counters),
    "Write-drain observation SQL did not return the expected read-only document",
  );

  const missingViews = await client.query(`
    select
      to_regclass('public.admin_orders') is null as admin_orders_absent,
      to_regclass('public.admin_orders_view') is null as admin_orders_view_absent
  `);
  assert(
    missingViews.rows[0]?.admin_orders_absent &&
      missingViews.rows[0]?.admin_orders_view_absent,
    "One or more exposed admin views still exist",
  );

  const guestOwnership = await client.query(`
    select user_id
    from public.orders
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  `);
  assert(
    guestOwnership.rows[0]?.user_id === null,
    "Shared guest ownership was not removed",
  );

  const knownPublicTables = [
    "addresses",
    "federal_holidays",
    "order_email_deliveries",
    "order_events",
    "order_items",
    "order_resume_tokens",
    "orders",
    "patients",
    "product_interest",
    "profiles",
    "resend_webhook_events",
    "resolver_audits",
    "site_reminders",
    "user_patients",
  ];

  const publicTableAudit = await client.query(
    `
      select
        c.relname as object_name,
        c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_any,
        has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_any,
        has_table_privilege('service_role', c.oid, 'select,insert,update,delete') as service_all
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname = any($1::text[])
      order by c.relname
    `,
    [knownPublicTables],
  );
  assert(
    publicTableAudit.rows.length === knownPublicTables.length,
    "Known public table inventory is incomplete",
  );
  for (const row of publicTableAudit.rows) {
    assert(row.rls_enabled, `${row.object_name} does not have RLS enabled`);
    assert(!row.anon_any, `anon retains DML on ${row.object_name}`);
    assert(
      !row.authenticated_any,
      `authenticated retains DML on ${row.object_name}`,
    );
    assert(row.service_all, `service_role lacks DML on ${row.object_name}`);
  }

  await expectDenied(client, "anon", "select * from public.orders");
  await expectDenied(
    client,
    "authenticated",
    "select * from public.orders where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'",
    [],
    "aaaaaaaa-0000-4000-8000-000000000001",
  );
  await expectDenied(
    client,
    "authenticated",
    "update public.orders set status = 'captured' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'",
    [],
    "aaaaaaaa-0000-4000-8000-000000000001",
  );
  const serviceOrders = await queryAs(
    client,
    "service_role",
    "select count(*)::integer as count from public.orders",
  );
  assert(serviceOrders.rows[0]?.count === 3, "service_role cannot read orders");

  const roleMembership = await client.query(`
    select pg_has_role('authenticated', 'service_role', 'member') as can_assume_service_role
  `);
  assert(
    !roleMembership.rows[0]?.can_assume_service_role,
    "authenticated is a member of service_role",
  );

  const publicFunctionAudit = await client.query(`
    select
      p.oid::regprocedure::text as object_name,
      p.prosecdef as security_definer,
      p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'execute') as service_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.oid::regprocedure::text
  `);
  for (const row of publicFunctionAudit.rows) {
    assert(!row.anon_execute, `anon can execute ${row.object_name}`);
    assert(
      !row.authenticated_execute,
      `authenticated can execute ${row.object_name}`,
    );
    assert(row.service_execute, `service_role cannot execute ${row.object_name}`);
    if (row.security_definer) {
      assert(
        hasPinnedSearchPath(row.proconfig),
        `${row.object_name} is SECURITY DEFINER without an empty search_path`,
      );
    }
  }

  const rateLimitMetadata = publicFunctionAudit.rows.find((row) =>
    row.object_name.startsWith("consume_rate_limit("),
  );
  assert(
    rateLimitMetadata?.security_definer,
    "consume_rate_limit must be SECURITY DEFINER",
  );
  await expectDenied(
    client,
    "anon",
    "select public.consume_rate_limit('12345678901234567890', 2, 60)",
  );
  const rateLimitResult = await queryAs(
    client,
    "service_role",
    `
      select array[
        public.consume_rate_limit('validation-bucket-00001', 2, 60),
        public.consume_rate_limit('validation-bucket-00001', 2, 60),
        public.consume_rate_limit('validation-bucket-00001', 2, 60)
      ] as decisions
    `,
  );
  assert(
    JSON.stringify(rateLimitResult.rows[0]?.decisions) ===
      JSON.stringify([true, true, false]),
    "Atomic rate limit did not enforce the configured limit",
  );

  const storageBucket = await client.query(`
    select public, file_size_limit, allowed_mime_types
    from storage.buckets
    where id = 'prescriptions'
  `);
  assert(!storageBucket.rows[0]?.public, "Prescription bucket is public");
  assert(
    Number(storageBucket.rows[0]?.file_size_limit) === 10_485_760,
    "Prescription bucket size limit is not 10 MB",
  );
  assert(
    JSON.stringify(storageBucket.rows[0]?.allowed_mime_types) ===
      JSON.stringify(["image/jpeg", "image/png"]),
    "Prescription bucket MIME allowlist is incorrect",
  );

  const commerceSchema = await client.query(`
    select
      has_schema_privilege('anon', 'commerce_v2', 'usage') as anon_usage,
      has_schema_privilege('authenticated', 'commerce_v2', 'usage') as authenticated_usage,
      has_schema_privilege('service_role', 'commerce_v2', 'usage') as service_usage
  `);
  assert(!commerceSchema.rows[0]?.anon_usage, "anon can use commerce_v2");
  assert(
    !commerceSchema.rows[0]?.authenticated_usage,
    "authenticated can use commerce_v2",
  );
  assert(
    commerceSchema.rows[0]?.service_usage,
    "service_role cannot use commerce_v2",
  );

  const commerceTableAudit = await client.query(`
    select
      c.relname as object_name,
      c.relrowsecurity as rls_enabled,
      has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_any,
      has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_any,
      has_table_privilege('service_role', c.oid, 'select,insert,update,delete') as service_all
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'commerce_v2'
      and c.relkind in ('r', 'p')
    order by c.relname
  `);
  assert(commerceTableAudit.rows.length === 15, "Unexpected Commerce v2 table count");
  for (const row of commerceTableAudit.rows) {
    assert(row.rls_enabled, `commerce_v2.${row.object_name} lacks RLS`);
    assert(!row.anon_any, `anon has Commerce v2 DML on ${row.object_name}`);
    assert(
      !row.authenticated_any,
      `authenticated has Commerce v2 DML on ${row.object_name}`,
    );
    assert(
      row.service_all,
      `service_role lacks Commerce v2 DML on ${row.object_name}`,
    );
  }

  const commerceFunctions = await client.query(`
    select
      p.oid::regprocedure::text as object_name,
      p.prosecdef as security_definer,
      p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'execute') as service_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('commerce_v2', 'legacy_archive')
    order by n.nspname, p.oid::regprocedure::text
  `);
  for (const row of commerceFunctions.rows) {
    assert(!row.security_definer, `${row.object_name} is unnecessarily SECURITY DEFINER`);
    assert(!row.anon_execute, `anon can execute ${row.object_name}`);
    assert(
      !row.authenticated_execute,
      `authenticated can execute ${row.object_name}`,
    );
    assert(row.service_execute, `service_role cannot execute ${row.object_name}`);
    assert(
      hasPinnedSearchPath(row.proconfig),
      `${row.object_name} does not pin an empty search_path`,
    );
  }

  const commerceViews = await client.query(`
    select c.relname as object_name, c.reloptions
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'commerce_v2'
      and c.relkind = 'v'
    order by c.relname
  `);
  assert(commerceViews.rows.length === 2, "Unexpected Commerce v2 view count");
  for (const row of commerceViews.rows) {
    assert(
      row.reloptions?.includes("security_invoker=true"),
      `${row.object_name} is not security_invoker`,
    );
  }

  const testOrderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await executeAs(
    client,
    "service_role",
    `
      insert into commerce_v2.orders (
        id,
        customer_user_id,
        customer_email,
        subtotal_cents,
        total_cents,
        placed_at
      )
      values ($1, $2, 'admin-test@example.invalid', 1000, 1000, now())
    `,
    [testOrderId, "aaaaaaaa-0000-4000-8000-000000000001"],
  );
  await executeAs(
    client,
    "service_role",
    `
      select commerce_v2.apply_admin_override(
        $1,
        'cancelled',
        'admin-security-gate',
        'Disposable security validation'
      )
    `,
    [testOrderId],
  );
  const adminAudit = await queryAs(
    client,
    "service_role",
    `
      select
        (select count(*)::integer from commerce_v2.order_adjustments where order_id = $1) as adjustments,
        (select count(*)::integer from commerce_v2.order_events where order_id = $1 and event_type = 'admin_override') as events
    `,
    [testOrderId],
  );
  assert(
    adminAudit.rows[0]?.adjustments === 1 &&
      adminAudit.rows[0]?.events === 1,
    "Admin override did not create complete audit history",
  );

  const itemId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await executeAs(
    client,
    "service_role",
    `
      insert into commerce_v2.order_items (
        id, order_id, ordinal, sku, product_name, quantity,
        unit_amount_cents, product_snapshot
      )
      values ($1, $2, 1, 'VALIDATION-SKU', 'Validation item', 1, 1000, '{}')
    `,
    [itemId, testOrderId],
  );
  await expectDatabaseError(
    client,
    "service_role",
    "update commerce_v2.order_items set quantity = 2 where id = $1",
    "55000",
    [itemId],
  );

  const advisorEquivalent = await client.query(`
    with exposed_roles(role_name) as (
      values ('anon'::name), ('authenticated'::name)
    )
    select
      (
        select count(*)::integer
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'commerce_v2')
          and c.relkind in ('r', 'p')
          and not c.relrowsecurity
      ) as rls_disabled_tables,
      (
        select count(*)::integer
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join exposed_roles r
        where n.nspname in ('public', 'commerce_v2')
          and c.relkind = 'v'
          and not coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
          and has_table_privilege(r.role_name, c.oid, 'select')
      ) as exposed_definer_views,
      (
        select count(*)::integer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join exposed_roles r
        where n.nspname in ('public', 'commerce_v2')
          and p.prosecdef
          and has_function_privilege(r.role_name, p.oid, 'execute')
      ) as exposed_security_definer_functions,
      (
        select count(*)::integer
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join exposed_roles r
        where n.nspname in ('public', 'commerce_v2')
          and c.relkind in ('r', 'p', 'v')
          and a.attnum > 0
          and not a.attisdropped
          and a.attname in (
            'customer_email',
            'stripe_payment_intent_id',
            'rx',
            'patient_snapshot',
            'prescription_snapshot',
            'stripe_snapshot'
          )
          and has_column_privilege(r.role_name, c.oid, a.attnum, 'select')
      ) as exposed_sensitive_columns
  `);
  assert(
    advisorEquivalent.rows[0]?.rls_disabled_tables === 0,
    "Advisor equivalent found public/Commerce tables without RLS",
  );
  assert(
    advisorEquivalent.rows[0]?.exposed_definer_views === 0,
    "Advisor equivalent found an exposed creator-permission view",
  );
  assert(
    advisorEquivalent.rows[0]?.exposed_security_definer_functions === 0,
    "Advisor equivalent found an exposed SECURITY DEFINER function",
  );
  assert(
    advisorEquivalent.rows[0]?.exposed_sensitive_columns === 0,
    "Advisor equivalent found sensitive columns exposed to Data API roles",
  );

  await client.query(`
    create table public.validation_default_table (
      id bigint generated always as identity primary key
    );
    create function public.validation_default_function()
    returns boolean
    language sql
    security invoker
    set search_path = ''
    as 'select true';
  `);
  const defaultPrivilegeAudit = await client.query(`
    select
      has_table_privilege('anon', 'public.validation_default_table', 'select,insert,update,delete') as anon_table,
      has_table_privilege('authenticated', 'public.validation_default_table', 'select,insert,update,delete') as authenticated_table,
      has_table_privilege('service_role', 'public.validation_default_table', 'select,insert,update,delete') as service_table,
      has_function_privilege('anon', 'public.validation_default_function()', 'execute') as anon_function,
      has_function_privilege('authenticated', 'public.validation_default_function()', 'execute') as authenticated_function,
      has_function_privilege('service_role', 'public.validation_default_function()', 'execute') as service_function
  `);
  const defaultAcl = await client.query(`
    select
      d.defaclobjtype,
      pg_get_userbyid(d.defaclrole) as owner,
      n.nspname as schema_name,
      d.defaclacl::text
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    where pg_get_userbyid(d.defaclrole) = 'postgres'
      and n.nspname = 'public'
    order by d.defaclobjtype
  `);
  const validationFunctionAcl = await client.query(`
    select p.proacl::text
    from pg_proc p
    where p.oid = 'public.validation_default_function()'::regprocedure
  `);
  assert(!defaultPrivilegeAudit.rows[0]?.anon_table, "anon inherited future table DML");
  assert(
    !defaultPrivilegeAudit.rows[0]?.authenticated_table,
    "authenticated inherited future table DML",
  );
  assert(
    defaultPrivilegeAudit.rows[0]?.service_table,
    "service_role did not inherit future table DML",
  );
  assert(
    !defaultPrivilegeAudit.rows[0]?.anon_function,
    `anon inherited future function execution: ${JSON.stringify({
      privileges: defaultPrivilegeAudit.rows[0],
      defaultAcl: defaultAcl.rows,
      functionAcl: validationFunctionAcl.rows[0],
    })}`,
  );
  assert(
    !defaultPrivilegeAudit.rows[0]?.authenticated_function,
    "authenticated inherited future function execution",
  );
  assert(
    defaultPrivilegeAudit.rows[0]?.service_function,
    "service_role did not inherit future function execution",
  );
  await client.query(`
    drop function public.validation_default_function();
    drop table public.validation_default_table;
  `);

  const commerceRollback = await testCommerceReverse(
    client,
    connectionConfig,
  );

  return {
    applied,
    preRemediationExploit: {
      anonymousAdminViewRows: exposedRead.rows[0].count,
      anonymousAdminViewUpdate: "succeeded",
    },
    permissions: {
      publicTables: publicTableAudit.rows,
      publicFunctions: publicFunctionAudit.rows,
      commerceTables: commerceTableAudit.rows,
      commerceFunctions: commerceFunctions.rows,
      commerceViews: commerceViews.rows,
    },
    rlsAndAttackTests: {
      anonymousOrders: "denied",
      authenticatedDirectOrders: "denied (server-only data surface)",
      crossAccountUpdate: "denied",
      serviceRoleOrders: serviceOrders.rows[0].count,
      privilegeEscalation: "denied",
      sharedGuestOwnerRemoved: true,
      appendOnlyMutation: "denied with SQLSTATE 55000",
      adminOverrideAudit: adminAudit.rows[0],
    },
    securityDefiner: {
      publicSecurityDefiners: publicFunctionAudit.rows
        .filter((row) => row.security_definer)
        .map((row) => row.object_name),
      exposedToAnonOrAuthenticated: 0,
    },
    storage: storageBucket.rows[0],
    rateLimitDecisions: rateLimitResult.rows[0].decisions,
    advisorEquivalent: advisorEquivalent.rows[0],
    defaultPrivileges: defaultPrivilegeAudit.rows[0],
    productionPreparationPackage: {
      preMigrationSqlChecks: 12,
      postMigrationAssertions: postMigrationAssertions.rows,
      catalogExport: "valid",
      rollbackRecoveryExport: "valid",
      commerceRollback,
    },
  };
}

async function main() {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "hl-security-gate-"),
  );
  const dataDirectory = path.join(temporaryRoot, "postgres");
  const port = await findFreePort();
  let started = false;
  let client;

  try {
    await runProcess(initdb, [
      "-D",
      dataDirectory,
      "--username=postgres",
      "--auth=trust",
      "--encoding=UTF8",
      "--no-locale",
    ]);
    await runProcess(pgCtl, [
      "-D",
      dataDirectory,
      "-l",
      path.join(temporaryRoot, "postgres.log"),
      "-o",
      `-F -p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ]);
    started = true;

    const connectionConfig = {
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
    };
    client = new Client(connectionConfig);
    await client.connect();
    const version = await client.query(
      "select current_setting('server_version') as version",
    );
    const report = await runGate(client, connectionConfig);

    console.log(
      JSON.stringify(
        {
          environment: {
            kind: "temporary-local-postgresql",
            serverVersion: version.rows[0]?.version,
            productionConnected: false,
          },
          ...report,
        },
        null,
        2,
      ),
    );
  } finally {
    if (client) await client.end().catch(() => {});
    if (started) {
      await runProcess(pgCtl, [
        "-D",
        dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ]).catch(() => {});
    }
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemp = path.resolve(tmpdir());
    if (
      resolvedTemporaryRoot.startsWith(
        `${resolvedSystemTemp}${path.sep}hl-security-gate-`,
      )
    ) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
