import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getOrderRecoveryEmailIdempotencyKey,
  ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS,
  runWithOrderRecoveryEmailSendClaim,
  type OrderRecoveryEmailSendClaim,
} from "./orderRecoveryClaim";

function createClaimStore() {
  let nowSeconds = 0;
  let claimedAtSeconds: number | null = null;
  let claimSequence = 0;

  return {
    advance(seconds: number) {
      nowSeconds += seconds;
    },
    async acquire(): Promise<OrderRecoveryEmailSendClaim | null> {
      if (
        claimedAtSeconds !== null &&
        nowSeconds - claimedAtSeconds < ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS
      ) {
        return null;
      }

      claimedAtSeconds = nowSeconds;
      claimSequence += 1;
      return {
        claimId: `claim-${claimSequence}`,
        claimedAt: new Date(nowSeconds * 1000).toISOString(),
      };
    },
  };
}

async function main() {
  const immediateStore = createClaimStore();
  let immediateTokenCreates = 0;
  let immediateSends = 0;
  const immediateAttempt = () =>
    runWithOrderRecoveryEmailSendClaim({
      acquireClaim: immediateStore.acquire,
      send: async () => {
        immediateTokenCreates += 1;
        immediateSends += 1;
      },
    });

  assert.equal(await immediateAttempt(), true);
  assert.equal(await immediateAttempt(), false);
  assert.equal(immediateTokenCreates, 1, "an immediate repeat creates no token");
  assert.equal(immediateSends, 1, "an immediate repeat sends no email");

  const concurrentStore = createClaimStore();
  let concurrentTokenCreates = 0;
  let concurrentSends = 0;
  const concurrentResults = await Promise.all(
    Array.from({ length: 8 }, () =>
      runWithOrderRecoveryEmailSendClaim({
        acquireClaim: concurrentStore.acquire,
        send: async () => {
          concurrentTokenCreates += 1;
          concurrentSends += 1;
        },
      }),
    ),
  );
  assert.equal(concurrentResults.filter(Boolean).length, 1);
  assert.equal(concurrentTokenCreates, 1, "concurrent repeats create one token");
  assert.equal(concurrentSends, 1, "concurrent repeats send one email");

  concurrentStore.advance(ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS);
  assert.equal(
    await runWithOrderRecoveryEmailSendClaim({
      acquireClaim: concurrentStore.acquire,
      send: async () => {
        concurrentTokenCreates += 1;
        concurrentSends += 1;
      },
    }),
    true,
    "a new request is allowed after the cooldown",
  );
  assert.equal(concurrentTokenCreates, 2);
  assert.equal(concurrentSends, 2);

  assert.equal(
    getOrderRecoveryEmailIdempotencyKey("claim-1"),
    getOrderRecoveryEmailIdempotencyKey("claim-1"),
    "the Resend idempotency key is stable for one database claim",
  );
  assert.notEqual(
    getOrderRecoveryEmailIdempotencyKey("claim-1"),
    getOrderRecoveryEmailIdempotencyKey("claim-2"),
    "a later claimed send receives a new idempotency key",
  );

  const recoveryClient = readFileSync(
    join(process.cwd(), "src", "app", "resume-order", "ResumeOrderClient.tsx"),
    "utf8",
  );
  assert.ok(
    recoveryClient.includes(
      'setMessage("Check your email for a secure link to resume your order.")',
    ),
    "every successful response shows the privacy-neutral success message",
  );
  assert.equal(
    recoveryClient.includes("body.found"),
    false,
    "the recovery page never branches on a found field",
  );
  assert.equal(
    recoveryClient.includes("No unfinished orders were found"),
    false,
    "the recovery page no longer shows a false not-found result",
  );

  console.log("Order recovery email claim regression tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
