import { evaluateFounderAuthority, parseScopes } from "./founder-authority.mjs";

const args = process.argv.slice(2);
const values = (flag) => args.flatMap((arg, index) => (arg === flag && args[index + 1] ? [args[index + 1]] : []));
const has = (flag) => args.includes(flag);
const requestedScopes = values("--scope");

if (requestedScopes.length === 0) {
  console.error("At least one exact --scope is required.");
  process.exit(2);
}

const technicalBlockers = [];
for (const name of values("--require-env")) {
  if (!process.env[name]) technicalBlockers.push({ type: "missing_credentials", detail: `${name} is unavailable.` });
}
if (has("--provider-unavailable")) technicalBlockers.push({ type: "provider_unavailable", detail: "Target provider is unavailable." });
if (has("--impossible")) technicalBlockers.push({ type: "impossible_operation", detail: "Requested operation cannot be performed." });
if (has("--founder-prohibited")) technicalBlockers.push({ type: "founder_prohibition", detail: "Execution would violate an explicit founder prohibition." });

const result = evaluateFounderAuthority({
  founderGo: process.env.FOUNDER_GO === "1",
  authorizedScopes: parseScopes(process.env.FOUNDER_GO_SCOPE),
  requestedScopes,
  advisories: values("--advisory"),
  technicalBlockers,
  destructive: has("--destructive"),
  destructiveAuthorized: process.env.FOUNDER_DESTRUCTIVE_GO === "1",
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.proceed ? 0 : 1);
