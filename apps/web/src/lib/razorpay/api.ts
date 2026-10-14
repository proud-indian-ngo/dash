import { type RazorpayPayment, razorpayPaymentSchema } from "./payment";
import { type RazorpayRefund, razorpayRefundSchema } from "./refund-schema";
import {
  ONDEMAND_SETTLEMENT_ID,
  type RazorpayReconItem,
  type RazorpaySettlement,
  razorpayOndemandSettlementSchema,
  razorpayReconItemSchema,
  razorpaySettlementSchema,
} from "./settlement-schema";

/**
 * Server-only. The Razorpay API calls pi-dash makes, with basic auth; the
 * key secret goes only into the Authorization header. A client makes its
 * calls one at a time and at least `gapMs` apart, and a 429 waits for
 * Retry-After (or 1, 2, 4… seconds) before trying again, so a long backfill
 * stays inside Razorpay's rate limits. Nothing here logs a response.
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;
/** Razorpay's largest page. */
export const PAGE_SIZE = 100;
/** The settlement recon's largest page. */
export const RECON_PAGE_SIZE = 1000;
/** A day with more payments than this is not a day of this trust's donations. */
const MAX_PAGES = 500;
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

export class RazorpayApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Razorpay API answered ${status}`);
    this.name = "RazorpayApiError";
    this.status = status;
  }
}

export interface RazorpayKey {
  id: string;
  secret: string;
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  /** Least time between two calls, in milliseconds. */
  gapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** A window of `created_at` times, in unix seconds, both ends included. */
export interface UnixWindow {
  from: number;
  to: number;
}

/** One listing: the entities read, how many could not be, and pages fetched. */
export interface Listing<T> {
  items: T[];
  pages: number;
  unreadable: number;
}

/** The settlement recon, with the settlements its unreadable lines named. */
export interface ReconListing extends Listing<RazorpayReconItem> {
  /** Settlement ID to how many of its lines could not be read. */
  unreadableBySettlement: Map<string, number>;
}

/** One India day, as the settlement recon takes it. */
export interface ReconDay {
  day: number;
  month: number;
  year: number;
}

export interface RazorpayClient {
  fetchPayment(paymentId: string): Promise<RazorpayPayment | null>;
  fetchRefund(refundId: string): Promise<RazorpayRefund | null>;
  fetchSettlement(settlementId: string): Promise<RazorpaySettlement | null>;
  listPaymentRefunds(paymentId: string): Promise<Listing<RazorpayRefund>>;
  listPayments(window: UnixWindow): Promise<Listing<RazorpayPayment>>;
  listRefunds(window: UnixWindow): Promise<Listing<RazorpayRefund>>;
  /** Lines settled on one day: payments, refunds, transfers and adjustments. */
  listSettlementRecon(day: ReconDay): Promise<ReconListing>;
  listSettlements(window: UnixWindow): Promise<Listing<RazorpaySettlement>>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Milliseconds a 429 asks to wait: Retry-After in seconds or as a date, else doubling from a second. */
export function rateLimitWait(
  retryAfter: string | null,
  attempt: number,
  now: number = Date.now()
): number {
  let wait = 1000 * 2 ** attempt;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      wait = seconds * 1000;
    } else {
      const at = Date.parse(retryAfter);
      if (!Number.isNaN(at)) {
        wait = Math.max(0, at - now);
      }
    }
  }
  return Math.min(wait, MAX_RATE_LIMIT_WAIT_MS);
}

interface Parser<T> {
  safeParse(value: unknown): { data?: T; success: boolean };
}

function parseCollection<T>(
  body: unknown,
  schema: Parser<T>,
  onUnreadable?: (raw: unknown) => void
): { count: number; items: T[]; unreadable: number } {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) {
    throw new Error("Razorpay API returned a list pi-dash cannot read");
  }
  const items: T[] = [];
  let unreadable = 0;
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success && parsed.data !== undefined) {
      items.push(parsed.data);
    } else {
      unreadable += 1;
      onUnreadable?.(item);
    }
  }
  return { count: raw.length, items, unreadable };
}

export function createRazorpayClient(
  key: RazorpayKey,
  {
    fetchImpl = fetch,
    gapMs = 0,
    now = Date.now,
    sleep = defaultSleep,
  }: ClientOptions = {}
): RazorpayClient {
  const authorization = `Basic ${Buffer.from(`${key.id}:${key.secret}`).toString("base64")}`;
  let lastCallAt: number | null = null;

  /** One GET, paced, retried on 429; null on 404. */
  async function get(
    path: string,
    query: Record<string, number> = {}
  ): Promise<unknown> {
    const search = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)])
    ).toString();
    const url = `${API_BASE}${path}${search ? `?${search}` : ""}`;
    for (let attempt = 0; ; attempt += 1) {
      if (lastCallAt !== null && gapMs > 0) {
        const wait = lastCallAt + gapMs - now();
        if (wait > 0) {
          await sleep(wait);
        }
      }
      lastCallAt = now();
      const response = await fetchImpl(url, {
        headers: { accept: "application/json", authorization },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        await sleep(
          rateLimitWait(response.headers.get("retry-after"), attempt, now())
        );
        continue;
      }
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new RazorpayApiError(response.status);
      }
      return await response.json();
    }
  }

  async function list<T>(
    path: string,
    window: UnixWindow | null,
    schema: Parser<T>,
    {
      onUnreadable,
      pageSize = PAGE_SIZE,
      query = {},
    }: {
      onUnreadable?: (raw: unknown) => void;
      pageSize?: number;
      query?: Record<string, number>;
    } = {}
  ): Promise<Listing<T>> {
    const listing: Listing<T> = { items: [], pages: 0, unreadable: 0 };
    for (let skip = 0; listing.pages < MAX_PAGES; skip += pageSize) {
      const body = await get(path, {
        count: pageSize,
        ...(window ? { from: window.from, to: window.to } : {}),
        ...query,
        skip,
      });
      listing.pages += 1;
      if (body === null) {
        break;
      }
      const page = parseCollection(body, schema, onUnreadable);
      listing.items.push(...page.items);
      listing.unreadable += page.unreadable;
      if (page.count < pageSize) {
        return listing;
      }
    }
    if (listing.pages >= MAX_PAGES) {
      throw new Error("Razorpay listing has too many pages");
    }
    return listing;
  }

  async function one<T>(
    path: string,
    schema: Parser<T>,
    what: string
  ): Promise<T | null> {
    const body = await get(path);
    if (body === null) {
      return null;
    }
    const parsed = schema.safeParse(body);
    if (!(parsed.success && parsed.data !== undefined)) {
      throw new Error(`Razorpay API returned a ${what} pi-dash cannot read`);
    }
    return parsed.data;
  }

  return {
    fetchPayment: (paymentId) =>
      one(
        `/payments/${encodeURIComponent(paymentId)}`,
        razorpayPaymentSchema,
        "payment"
      ),
    fetchRefund: (refundId) =>
      one(
        `/refunds/${encodeURIComponent(refundId)}`,
        razorpayRefundSchema,
        "refund"
      ),
    listPaymentRefunds: (paymentId) =>
      list(
        `/payments/${encodeURIComponent(paymentId)}/refunds`,
        null,
        razorpayRefundSchema
      ),
    fetchSettlement: (settlementId) =>
      ONDEMAND_SETTLEMENT_ID.test(settlementId)
        ? one(
            `/settlements/ondemand/${encodeURIComponent(settlementId)}`,
            razorpayOndemandSettlementSchema,
            "settlement"
          )
        : one(
            `/settlements/${encodeURIComponent(settlementId)}`,
            razorpaySettlementSchema,
            "settlement"
          ),
    listPayments: (window) => list("/payments", window, razorpayPaymentSchema),
    listRefunds: (window) => list("/refunds", window, razorpayRefundSchema),
    listSettlementRecon: async ({ day, month, year }) => {
      // Only the settlement an unreadable line names is kept, to count it.
      const unreadableBySettlement = new Map<string, number>();
      const listing = await list(
        "/settlements/recon/combined",
        null,
        razorpayReconItemSchema,
        {
          onUnreadable: (raw) => {
            const id = (raw as { settlement_id?: unknown } | null)
              ?.settlement_id;
            if (typeof id === "string" && id.length <= 60) {
              unreadableBySettlement.set(
                id,
                (unreadableBySettlement.get(id) ?? 0) + 1
              );
            }
          },
          pageSize: RECON_PAGE_SIZE,
          query: { day, month, year },
        }
      );
      return { ...listing, unreadableBySettlement };
    },
    listSettlements: (window) =>
      list("/settlements", window, razorpaySettlementSchema),
  };
}

/** The payment, or null when Razorpay does not know the ID. */
export async function fetchRazorpayPayment(
  paymentId: string,
  key: RazorpayKey,
  fetchImpl: typeof fetch = fetch
): Promise<RazorpayPayment | null> {
  return await createRazorpayClient(key, { fetchImpl }).fetchPayment(paymentId);
}
