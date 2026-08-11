import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildPrescriptionSubmissionEmail,
  CUSTOMER_SUPPORT_EMAIL,
} from "./prescriptionSubmission";

const orderReference = "59d4f6e7-af19-40ee-b0ca-fa4345ba05f2";
const draft = buildPrescriptionSubmissionEmail(orderReference);

assert.equal(CUSTOMER_SUPPORT_EMAIL, "support@honestlenses.com");
assert.equal(draft.recipient, CUSTOMER_SUPPORT_EMAIL);
assert.equal(draft.orderReference, orderReference);
assert.equal(draft.subject, `Prescription for Order ${orderReference}`);
assert.equal(
  draft.body,
  `Please attach a clear photo or copy of your contact lens prescription to this email.\n\nOrder: ${orderReference}`,
);

const parsedMailto = new URL(draft.mailtoHref);
assert.equal(parsedMailto.protocol, "mailto:");
assert.equal(parsedMailto.pathname, CUSTOMER_SUPPORT_EMAIL);
assert.equal(parsedMailto.searchParams.get("subject"), draft.subject);
assert.equal(parsedMailto.searchParams.get("body"), draft.body);
assert.deepEqual([...parsedMailto.searchParams.keys()], ["subject", "body"]);
assert.doesNotMatch(
  `${draft.subject}\n${draft.body}`,
  /(?:payment|address|date of birth|dob|prescription value)/i,
);

const componentPath = fileURLToPath(
  new URL(
    "../../app/checkout/verification-details/VerificationDetailsClient.tsx",
    import.meta.url,
  ),
);
const componentSource = readFileSync(componentPath, "utf8");

assert.match(componentSource, /Already have a copy of your prescription\?/);
assert.match(componentSource, /Email us your prescription/);
assert.match(componentSource, /doctor information below/);
assert.match(componentSource, /<form onSubmit=\{handleSubmit\}>/);
assert.match(componentSource, /Submit verification details/);
assert.match(
  componentSource,
  /href=\{prescriptionEmail\.mailtoHref\}/,
  "the email CTA must remain a passive link",
);
assert.doesNotMatch(
  componentSource,
  /onClick=\{[^}]*prescriptionEmail/,
  "constructing or clicking the email link must not change order state",
);

assert.throws(() => buildPrescriptionSubmissionEmail("   "), /required/);

console.log("Post-payment prescription email CTA tests passed");
