import { open, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const repositoryRoot = process.cwd();
const fileEnvironment = parseEnvFile(
  await readFile(path.join(repositoryRoot, ".env.local"), "utf8"),
);
const stripeTestKey = fileEnvironment.STRIPE_SECRET_KEY_TEST;
const stripeTestPublishable =
  fileEnvironment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;
const hostedProjectRef =
  process.env.HOSTED_VALIDATION_PROJECT_REF?.trim() || null;
const productionProjectRef = "abhkbdyzfbcmpjrobwxq";

if (!stripeTestKey?.startsWith("sk_test_")) {
  throw new Error("A Stripe test-mode secret is required");
}
if (!stripeTestPublishable?.startsWith("pk_test_")) {
  throw new Error("A Stripe test-mode publishable key is required");
}
if (hostedProjectRef === productionProjectRef) {
  throw new Error("Refusing to launch against Honest Lenses production");
}

let supabaseUrl = "http://127.0.0.1:32119";
let anonKey = "local-anon-key";
let serviceRoleKey = "local-service-key";
if (hostedProjectRef) {
  const keys = JSON.parse(
    execFileSync(
      "supabase.cmd",
      [
        "projects",
        "api-keys",
        "--project-ref",
        hostedProjectRef,
        "--reveal",
        "--output",
        "json",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  anonKey = keys.find(
    (entry) => entry.name === "anon" && entry.type === "legacy",
  )?.api_key;
  serviceRoleKey = keys.find(
    (entry) => entry.name === "service_role" && entry.type === "legacy",
  )?.api_key;
  if (!anonKey || !serviceRoleKey) {
    throw new Error("Disposable hosted project keys were not found");
  }
  supabaseUrl = `https://${hostedProjectRef}.supabase.co`;
}

const stdout = await open(
  path.join(repositoryRoot, "security-next.out.log"),
  "w",
);
const stderr = await open(
  path.join(repositoryRoot, "security-next.err.log"),
  "w",
);
let mock = null;
let mockStdout = null;
let mockStderr = null;
if (!hostedProjectRef) {
  mockStdout = await open(
    path.join(repositoryRoot, "security-mock.out.log"),
    "w",
  );
  mockStderr = await open(
    path.join(repositoryRoot, "security-mock.err.log"),
    "w",
  );
  mock = spawn(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "security", "mock-supabase.mjs")],
    {
      cwd: repositoryRoot,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", mockStdout.fd, mockStderr.fd],
      env: { ...process.env, MOCK_SUPABASE_PORT: "32119" },
    },
  );
}
const child = spawn(
  process.execPath,
  [
    path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: repositoryRoot,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout.fd, stderr.fd],
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      SITE_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      STRIPE_SECRET_KEY: stripeTestKey,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripeTestPublishable,
      COMMERCE_V2_ENABLED: "false",
      PRESCRIPTION_OCR_ENABLED: "false",
      GUEST_ORDER_COOKIE_SECRET:
        "local-guest-security-secret-0123456789",
      ORDER_RESUME_TOKEN_SECRET:
        "local-resume-security-secret-0123456789",
      RATE_LIMIT_KEY_SECRET: "local-rate-security-secret-0123456789",
      ADMIN_EMAILS: "admin@example.invalid",
      ADMIN_ALERT_EMAIL: "admin@example.invalid",
      NEXT_PUBLIC_POSTHOG_SESSION_REPLAY: "false",
      NEXT_PUBLIC_POSTHOG_CAPTURE_EXCEPTIONS: "false",
      NEXT_PUBLIC_POSTHOG_KEY: "",
      POSTHOG_PROJECT_API_KEY: "",
    },
  },
);

mock?.unref();
child.unref();
if (mock) {
  await writeFile(
    path.join(repositoryRoot, ".security-mock.pid"),
    String(mock.pid),
    "utf8",
  );
}
await writeFile(
  path.join(repositoryRoot, ".security-next.pid"),
  String(child.pid),
  "utf8",
);
await stdout.close();
await stderr.close();
await mockStdout?.close();
await mockStderr?.close();
