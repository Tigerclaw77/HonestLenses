import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Webhook } from "svix";

import { handleResendWebhook } from "@/app/api/webhooks/resend/route";
import {
  normalizeResendDeliveryEvent,
  verifyResendWebhook,
} from "./emailDelivery";

const orderId = "fda32216-33c6-4479-8218-d4c69a98862d";

function event(
  type: string,
  extraData: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    created_at: "2026-07-21T18:00:00.000Z",
    data: {
      email_id: "email-test-1",
      created_at: "2026-07-21T17:59:59.000Z",
      from: "Honest Lenses <orders@honestlenses.com>",
      to: ["customer@example.com"],
      subject: "Order confirmation",
      tags: { order_id: orderId, email_type: "order_confirmation" },
      ...extraData,
    },
  };
}

const delivered = normalizeResendDeliveryEvent(
  event("email.delivered"),
  "svix-delivered",
);
assert.equal(delivered?.deliveryStatus, "delivered");
assert.equal(delivered?.requiresAttention, false);
assert.equal(delivered?.orderId, orderId);

const bounced = normalizeResendDeliveryEvent(
  event("email.bounced", {
    bounce: {
      type: "Permanent",
      subType: "MessageRejected",
      message: "Mailbox does not exist",
    },
  }),
  "svix-bounced",
);
assert.equal(bounced?.deliveryStatus, "bounced");
assert.equal(bounced?.requiresAttention, true);
assert.match(bounced?.failureReason ?? "", /mailbox does not exist/i);

const complained = normalizeResendDeliveryEvent(
  event("email.complained"),
  "svix-complained",
);
assert.equal(complained?.deliveryStatus, "complained");
assert.equal(complained?.requiresAttention, true);

const delayed = normalizeResendDeliveryEvent(
  event("email.delivery_delayed"),
  "svix-delayed",
);
assert.equal(delayed?.deliveryStatus, "delivery_delayed");
assert.equal(delayed?.requiresAttention, false);

assert.equal(
  normalizeResendDeliveryEvent(event("email.opened"), "svix-opened"),
  null,
  "unknown or non-operational events are ignored",
);

const signingSecret = `whsec_${randomBytes(32).toString("base64")}`;
const payload = JSON.stringify(event("email.delivered"));
const webhookId = "msg_test_signature";
const timestamp = new Date();
const signature = new Webhook(signingSecret).sign(
  webhookId,
  timestamp,
  payload,
);

assert.equal(
  verifyResendWebhook(
    payload,
    {
      id: webhookId,
      timestamp: String(Math.floor(timestamp.getTime() / 1000)),
      signature,
    },
    signingSecret,
  ).type,
  "email.delivered",
  "valid Resend signatures are accepted",
);

assert.throws(
  () =>
    verifyResendWebhook(
      payload,
      {
        id: webhookId,
        timestamp: String(Math.floor(timestamp.getTime() / 1000)),
        signature: "v1,invalid",
      },
      signingSecret,
    ),
  "invalid signatures are rejected",
);

async function runAsyncTests() {
  type StoredEvent = {
    orderId: string | null;
    referencedOrderId: string | null;
    processingStatus: "matched" | "unmatched";
  };

  function createStore(initialOrderIds: string[] = []) {
    const orders = new Set(initialOrderIds);
    const events = new Map<string, StoredEvent>();
    const deliveries = new Map<string, string>();
    const orderMutations: string[] = [];
    let applyCalls = 0;

    return {
      orders,
      events,
      deliveries,
      orderMutations,
      get applyCalls() {
        return applyCalls;
      },
      apply: async (normalized: {
        svixId: string;
        emailId: string;
        orderId: string | null;
        deliveryStatus: string;
      }) => {
        applyCalls += 1;
        const existing = events.get(normalized.svixId);
        if (existing) {
          return {
            duplicate: true,
            matched: existing.processingStatus === "matched",
            order_id: existing.orderId ?? undefined,
            processing_status: existing.processingStatus,
          };
        }

        const matched = Boolean(
          normalized.orderId && orders.has(normalized.orderId),
        );
        const stored: StoredEvent = {
          orderId: matched ? normalized.orderId : null,
          referencedOrderId: normalized.orderId,
          processingStatus: matched ? "matched" : "unmatched",
        };
        events.set(normalized.svixId, stored);

        if (!matched || !normalized.orderId) {
          return {
            duplicate: false,
            matched: false,
            processing_status: "unmatched" as const,
          };
        }

        deliveries.set(normalized.emailId, normalized.deliveryStatus);
        orderMutations.push(normalized.orderId);
        return {
          duplicate: false,
          matched: true,
          order_id: normalized.orderId,
          processing_status: "matched" as const,
        };
      },
    };
  }

  function signedRequest({
    body,
    id,
    secret = signingSecret,
    signatureOverride,
  }: {
    body: string;
    id: string;
    secret?: string;
    signatureOverride?: string;
  }) {
    const signedAt = new Date();
    const signed = new Webhook(secret).sign(id, signedAt, body);
    return new Request("https://www.honestlenses.com/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": id,
        "svix-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
        "svix-signature": signatureOverride ?? signed,
      },
      body,
    });
  }

  const matchedStore = createStore([orderId]);
  const matchedPayload = JSON.stringify(event("email.delivered"));
  const matchedResponse = await handleResendWebhook(
    signedRequest({ body: matchedPayload, id: "svix-matched-route" }),
    { webhookSecret: signingSecret, applyEvent: matchedStore.apply },
  );
  const matchedBody = await matchedResponse.json();
  assert.equal(matchedResponse.status, 200);
  assert.equal(matchedBody.matched, true);
  assert.equal(matchedStore.events.size, 1, "matched event is recorded");
  assert.equal(
    matchedStore.deliveries.get("email-test-1"),
    "delivered",
    "matched event updates delivery state",
  );
  assert.deepEqual(matchedStore.orderMutations, [orderId]);

  const unknownOrderId = "85d8db73-047c-448c-959b-1613d23319a1";
  const unknownStore = createStore([orderId]);
  const unknownPayload = JSON.stringify(
    event("email.delivered", {
      tags: {
        order_id: unknownOrderId,
        email_type: "order_confirmation",
      },
    }),
  );
  const unknownResponse = await handleResendWebhook(
    signedRequest({ body: unknownPayload, id: "svix-unknown-route" }),
    { webhookSecret: signingSecret, applyEvent: unknownStore.apply },
  );
  assert.equal(unknownResponse.status, 200);
  assert.equal((await unknownResponse.json()).matched, false);
  assert.deepEqual(unknownStore.events.get("svix-unknown-route"), {
    orderId: null,
    referencedOrderId: unknownOrderId,
    processingStatus: "unmatched",
  });
  assert.equal(unknownStore.deliveries.size, 0);
  assert.equal(unknownStore.orderMutations.length, 0);

  const deletedStore = createStore([orderId]);
  deletedStore.orders.delete(orderId);
  const deletedResponse = await handleResendWebhook(
    signedRequest({ body: matchedPayload, id: "svix-deleted-route" }),
    { webhookSecret: signingSecret, applyEvent: deletedStore.apply },
  );
  assert.equal(deletedResponse.status, 200);
  assert.equal((await deletedResponse.json()).matched, false);
  assert.equal(
    deletedStore.events.get("svix-deleted-route")?.processingStatus,
    "unmatched",
  );
  assert.equal(deletedStore.orderMutations.length, 0);

  const missingMetadataStore = createStore([orderId]);
  const missingMetadataPayload = JSON.stringify(
    event("email.delivered", { tags: {} }),
  );
  const missingMetadataResponse = await handleResendWebhook(
    signedRequest({
      body: missingMetadataPayload,
      id: "svix-missing-metadata-route",
    }),
    {
      webhookSecret: signingSecret,
      applyEvent: missingMetadataStore.apply,
    },
  );
  assert.equal(missingMetadataResponse.status, 200);
  assert.equal((await missingMetadataResponse.json()).matched, false);
  assert.equal(
    missingMetadataStore.events.get("svix-missing-metadata-route")
      ?.processingStatus,
    "unmatched",
  );
  assert.equal(missingMetadataStore.orderMutations.length, 0);

  const duplicateStore = createStore([orderId]);
  const duplicateId = "svix-idempotent-route";
  const firstResponse = await handleResendWebhook(
    signedRequest({ body: matchedPayload, id: duplicateId }),
    { webhookSecret: signingSecret, applyEvent: duplicateStore.apply },
  );
  const duplicateResponse = await handleResendWebhook(
    signedRequest({ body: matchedPayload, id: duplicateId }),
    { webhookSecret: signingSecret, applyEvent: duplicateStore.apply },
  );
  assert.equal(firstResponse.status, 200);
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).duplicate, true);
  assert.equal(duplicateStore.events.size, 1);
  assert.equal(
    duplicateStore.orderMutations.length,
    1,
    "duplicate event does not repeat delivery or order mutation",
  );

  const invalidSignatureStore = createStore([orderId]);
  const invalidSignatureResponse = await handleResendWebhook(
    signedRequest({
      body: matchedPayload,
      id: "svix-invalid-signature-route",
      signatureOverride: "v1,invalid",
    }),
    {
      webhookSecret: signingSecret,
      applyEvent: invalidSignatureStore.apply,
    },
  );
  assert.equal(invalidSignatureResponse.status, 400);
  assert.equal(invalidSignatureStore.applyCalls, 0);
  assert.equal(invalidSignatureStore.events.size, 0);
  assert.equal(invalidSignatureStore.orderMutations.length, 0);

  const malformedStore = createStore([orderId]);
  const malformedPayload = JSON.stringify({ type: "email.delivered", data: {} });
  const malformedResponse = await handleResendWebhook(
    signedRequest({ body: malformedPayload, id: "svix-malformed-route" }),
    { webhookSecret: signingSecret, applyEvent: malformedStore.apply },
  );
  assert.equal(malformedResponse.status, 400);
  assert.equal(malformedStore.applyCalls, 0);
  assert.equal(malformedStore.events.size, 0);
  assert.equal(malformedStore.orderMutations.length, 0);

  const malformedJsonStore = createStore([orderId]);
  const malformedJsonResponse = await handleResendWebhook(
    signedRequest({ body: "{", id: "svix-malformed-json-route" }),
    {
      webhookSecret: signingSecret,
      applyEvent: malformedJsonStore.apply,
    },
  );
  assert.equal(malformedJsonResponse.status, 400);
  assert.equal(malformedJsonStore.applyCalls, 0);
  assert.equal(malformedJsonStore.events.size, 0);
  assert.equal(malformedJsonStore.orderMutations.length, 0);

  const ignoredStore = createStore([orderId]);
  const ignoredPayload = JSON.stringify(event("email.opened"));
  const ignoredResponse = await handleResendWebhook(
    signedRequest({ body: ignoredPayload, id: "svix-ignored-route" }),
    { webhookSecret: signingSecret, applyEvent: ignoredStore.apply },
  );
  assert.equal(ignoredResponse.status, 200);
  assert.equal((await ignoredResponse.json()).ignored, true);
  assert.equal(ignoredStore.applyCalls, 0);

  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260731230830_handle_unmatched_resend_webhooks.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /referenced_order_id uuid/i);
  assert.match(migration, /processing_status in \('matched', 'unmatched'\)/i);
  assert.doesNotMatch(
    migration,
    /drop constraint\s+resend_webhook_events_order_id_fkey/i,
    "the order foreign key remains intact",
  );
  const validationPosition = migration.indexOf(
    "if v_candidate_order_id is not null and exists",
  );
  const eventInsertPosition = migration.indexOf(
    "insert into public.resend_webhook_events",
  );
  const unmatchedReturnPosition = migration.indexOf("if v_order_id is null then");
  const deliveryMutationPosition = migration.indexOf(
    "insert into public.order_email_deliveries as deliveries",
  );
  assert.ok(validationPosition >= 0 && validationPosition < eventInsertPosition);
  assert.ok(
    unmatchedReturnPosition > eventInsertPosition &&
      unmatchedReturnPosition < deliveryMutationPosition,
    "unmatched events return before any delivery or order mutation",
  );

  console.log("Transactional email delivery matrix passed");
}

runAsyncTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
