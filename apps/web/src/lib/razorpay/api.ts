import { type RazorpayPayment, razorpayPaymentSchema } from "./payment";

/**
 * Server-only. The one Razorpay API call 3c-1 makes: fetch a payment by ID
 * with basic auth. The key secret goes only into the Authorization header.
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;

export class RazorpayApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Razorpay API answered ${status}`);
    this.name = "RazorpayApiError";
    this.status = status;
  }
}

/** The payment, or null when Razorpay does not know the ID. */
export async function fetchRazorpayPayment(
  paymentId: string,
  key: { id: string; secret: string },
  fetchImpl: typeof fetch = fetch
): Promise<RazorpayPayment | null> {
  const response = await fetchImpl(
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${key.id}:${key.secret}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new RazorpayApiError(response.status);
  }
  const parsed = razorpayPaymentSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Razorpay API returned a payment pi-dash cannot read");
  }
  return parsed.data;
}
