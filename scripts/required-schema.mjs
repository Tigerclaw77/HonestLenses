import { readFileSync } from "node:fs";

// Validate the projections actually shipped by the admin routes.
export function readAdminOrderProjections() {
  const projections = {};
  for (const [file, names] of [
    ["../src/app/api/admin/orders/route.ts", ["ADMIN_ORDER_LIST_FIELDS"]],
    ["../src/app/api/admin/orders/[id]/route.ts", ["ADMIN_ORDER_DETAIL_FIELDS", "ADMIN_ORDER_PATCH_FIELDS"]],
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const name of names) {
      const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]\\.join\\(","\\)`));
      if (!match) throw new Error(`Unable to validate admin order projection: ${name}`);
      const fields = [...match[1].matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((item) => item[1]);
      if (!fields.length) throw new Error(`Empty admin order projection: ${name}`);
      projections[name] = fields.join(",");
    }
  }
  return projections;
}

// Zero-row PostgREST probes validate the actual deployed schema and service grants.
export const REQUIRED_SCHEMA = {
  orders: "id,status,sku,subtotal_cents,total_amount_cents,payment_intent_id,customer_order_number,confirmation_email_sent_at,archived,archived_at,fulfillment_status",
  order_receipt_snapshots: "order_id,snapshot,captured_amount_cents",
  order_receipt_access_tokens: "order_id,token_hash,expires_at",
  order_email_deliveries: "order_id,email_type,resend_email_id",
  order_resume_tokens: "order_id,token_hash,expires_at,used_at",
  cart_save_tokens: "order_id,token_hash,expires_at",
  recovery_touch_drafts: "order_id,touch_hours,email,token_hash,activity_at,expires_at,state,first_attempt_at,last_attempt_at,provider_id,sent_at,ignored_at,reviewed_at,reviewed_by",
  order_operations_control: "id,recovery_enabled,postal_address,lease_id,last_succeeded_at,last_error",
  commercial_email_suppressions: "email_hash,created_at",
  order_stuck_alerts: "order_id,state_key,state_since,active,acknowledged_until,notification_claimed_at,notified_at",
};

export async function assertRequiredSchema(client) {
  const failures = [];
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const selected = table === "orders"
      ? [...new Set([columns, ...Object.values(readAdminOrderProjections())].join(",").split(","))].join(",")
      : columns;
    const { error } = await client.from(table).select(selected).limit(0);
    if (error) failures.push(`${table}: ${error.code ?? "unknown"} ${error.message}`);
  }
  if (failures.length) throw new Error(`REQUIRED PRODUCTION SCHEMA MISSING OR INACCESSIBLE. Correct the query/schema mismatch or verify the corresponding migrations before deployment:\n${failures.join("\n")}`);
}
