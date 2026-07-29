import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import {
  initdb,
  pg_ctl as pgCtl,
} from "@embedded-postgres/windows-x64";

const { Client } = pg;
const expectedVersion = "17.10";
const defaultClientBin = process.env.LOCALAPPDATA
  ? path.join(
      process.env.LOCALAPPDATA,
      "HonestLensesTools",
      "PostgreSQL-17.10",
      "pgsql",
      "bin",
    )
  : "";
const clientBin = process.env.HL_POSTGRES_CLIENT_BIN || defaultClientBin;
const executables = {
  pg_dump: path.join(clientBin, "pg_dump.exe"),
  pg_dumpall: path.join(clientBin, "pg_dumpall.exe"),
  psql: path.join(clientBin, "psql.exe"),
};
const serverBin = path.dirname(initdb);
const serverEnvironment = {
  ...process.env,
  PATH: `${serverBin}${path.delimiter}${process.env.PATH ?? ""}`,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
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

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

let temporaryRoot;
let dataDirectory;
let serverStarted = false;

try {
  assert(clientBin, "HL_POSTGRES_CLIENT_BIN or LOCALAPPDATA is required");
  for (const executable of Object.values(executables)) {
    const metadata = await stat(executable);
    assert(metadata.isFile(), `Missing PostgreSQL client: ${executable}`);
  }

  const versions = {};
  for (const [name, executable] of Object.entries(executables)) {
    const result = await runProcess(executable, ["--version"]);
    assert(
      result.stdout.includes(`PostgreSQL) ${expectedVersion}`),
      `${name} must be PostgreSQL ${expectedVersion}; received ${result.stdout.trim()}`,
    );
    versions[name] = result.stdout.trim();
  }

  temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "honest-lenses-baseline-toolchain-"),
  );
  dataDirectory = path.join(temporaryRoot, "data");
  const outputDirectory = path.join(temporaryRoot, "evidence");
  const fixturePath = path.join(temporaryRoot, "fixture.sql");
  const catalogQueryPath = path.join(temporaryRoot, "catalog-check.sql");
  const schemaPath = path.join(outputDirectory, "schema-public.sql");
  const rolesPath = path.join(outputDirectory, "roles.sql");
  const catalogPath = path.join(outputDirectory, "catalog.txt");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(outputDirectory, { recursive: true }),
  );

  const port = await findFreePort();
  await runProcess(
    initdb,
    [
      "-D",
      dataDirectory,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--encoding=UTF8",
      "--no-locale",
    ],
    { env: serverEnvironment },
  );
  await runProcess(
    pgCtl,
    [
      "-D",
      dataDirectory,
      "-l",
      path.join(temporaryRoot, "postgres.log"),
      "-o",
      `-F -p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ],
    { env: serverEnvironment },
  );
  serverStarted = true;

  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      create role anon nologin;
      create role authenticated nologin;
      create table public.baseline_capture_fixture (
        id bigint generated always as identity primary key,
        owner_id uuid not null,
        note text not null
      );
      alter table public.baseline_capture_fixture enable row level security;
      create index baseline_capture_fixture_owner_idx
        on public.baseline_capture_fixture (owner_id);
      revoke all on public.baseline_capture_fixture from anon, authenticated;
    `);
  } finally {
    await client.end();
  }

  await writeFile(
    fixturePath,
    "-- The fixture was created through the test client; this file proves psql input.\nselect 1;\n",
  );
  await writeFile(
    catalogQueryPath,
    [
      "\\pset tuples_only on",
      "\\pset format unaligned",
      "select current_setting('transaction_read_only');",
      "select count(*) from pg_class where relname = 'baseline_capture_fixture';",
      "",
    ].join("\n"),
  );

  await runProcess(executables.pg_dump, [
    "--dbname",
    databaseUrl,
    "--schema",
    "public",
    "--schema-only",
    "--format",
    "plain",
    "--file",
    schemaPath,
  ]);
  await runProcess(executables.pg_dumpall, [
    "--database",
    databaseUrl,
    "--roles-only",
    "--file",
    rolesPath,
  ]);
  await runProcess(executables.psql, [
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--dbname",
    databaseUrl,
    "--file",
    fixturePath,
  ]);
  await runProcess(executables.psql, [
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--dbname",
    databaseUrl,
    "--file",
    catalogQueryPath,
    "--output",
    catalogPath,
  ]);

  const schema = await readFile(schemaPath, "utf8");
  const roles = await readFile(rolesPath, "utf8");
  const catalog = await readFile(catalogPath, "utf8");
  assert(
    schema.includes("CREATE TABLE public.baseline_capture_fixture"),
    "pg_dump did not capture the fixture table",
  );
  assert(
    schema.includes("ENABLE ROW LEVEL SECURITY"),
    "pg_dump did not capture RLS enablement",
  );
  assert(
    schema.includes("baseline_capture_fixture_owner_idx"),
    "pg_dump did not capture the fixture index",
  );
  assert(
    roles.includes("CREATE ROLE anon") &&
      roles.includes("CREATE ROLE authenticated"),
    "pg_dumpall did not capture the expected roles",
  );
  assert(
    catalog.replaceAll("\r", "").trim().endsWith("1"),
    "psql catalog probe did not find the fixture",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        target: "disposable local PostgreSQL; production not connected",
        versions,
        executableSha256: {
          pg_dump: await sha256(executables.pg_dump),
          pg_dumpall: await sha256(executables.pg_dumpall),
          psql: await sha256(executables.psql),
        },
        captures: {
          schema: true,
          roles: true,
          catalogProbe: true,
        },
      },
      null,
      2,
    ),
  );
} finally {
  if (serverStarted && dataDirectory) {
    await runProcess(pgCtl, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], {
      env: serverEnvironment,
    }).catch(() => {});
  }
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}
