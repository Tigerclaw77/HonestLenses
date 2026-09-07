import { createClient } from "@supabase/supabase-js";
import { assertRequiredSchema } from "./required-schema.mjs";

if (process.env.VERCEL_ENV === "production" || process.argv.includes("--required")) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Required production schema check needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  await assertRequiredSchema(createClient(url, key, { auth: { persistSession: false } }));
  console.log("Required production checkout/recovery/receipt schema verified (read-only).");
} else {
  console.log("Production schema check deferred for local/preview build; use --required against the release database.");
}
