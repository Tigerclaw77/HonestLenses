export type OrderRecoveryState = {
  hasRecovery: true;
  orderId: string;
  resumeUrl: string;
};

type RecoveryFailure = {
  kind: "http" | "network" | "invalid_response";
  error: unknown;
  status?: number;
};

export type OrderRecoveryResult =
  | { recovery: OrderRecoveryState; failure: null }
  | { recovery: null; failure: null }
  | { recovery: null; failure: RecoveryFailure };

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrderId(value: string | null): value is string {
  return Boolean(value && ORDER_ID_PATTERN.test(value));
}

function isRecoveryState(value: unknown): value is OrderRecoveryState {
  if (!value || typeof value !== "object") return false;

  const recovery = value as Partial<OrderRecoveryState>;
  return (
    recovery.hasRecovery === true &&
    isOrderId(recovery.orderId ?? null) &&
    typeof recovery.resumeUrl === "string" &&
    recovery.resumeUrl.startsWith("/") &&
    !recovery.resumeUrl.startsWith("//") &&
    !recovery.resumeUrl.includes("\\")
  );
}

export async function getCurrentOrderRecovery(
  fetcher: Fetcher = fetch,
): Promise<OrderRecoveryResult> {
  try {
    const response = await fetcher("/api/order-recovery/current", {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        recovery: null,
        failure: {
          kind: "http",
          status: response.status,
          error: new Error("Order recovery request failed."),
        },
      };
    }

    const body: unknown = await response.json().catch(() => null);

    if (
      body &&
      typeof body === "object" &&
      (body as { hasRecovery?: unknown }).hasRecovery === false
    ) {
      return { recovery: null, failure: null };
    }

    if (isRecoveryState(body)) {
      return { recovery: body, failure: null };
    }

    return {
      recovery: null,
      failure: {
        kind: "invalid_response",
        error: new Error("Order recovery response was invalid."),
      },
    };
  } catch (error: unknown) {
    return {
      recovery: null,
      failure: { kind: "network", error },
    };
  }
}

export function getCheckoutRecoveryPath(
  recovery: OrderRecoveryState | null,
): string {
  if (!recovery) return "/cart?notice=checkout";

  const destination = new URL(recovery.resumeUrl, "https://honestlenses.com");
  const destinationOrderId = destination.searchParams.get("orderId");

  if (
    destination.origin === "https://honestlenses.com" &&
    destination.pathname === "/checkout" &&
    destinationOrderId === recovery.orderId &&
    isOrderId(destinationOrderId)
  ) {
    return `${destination.pathname}?${destination.searchParams.toString()}`;
  }

  return "/cart?notice=checkout";
}
