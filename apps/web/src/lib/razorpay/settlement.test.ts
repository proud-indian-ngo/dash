import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const {
  reconDayOf,
  syncRazorpaySettlement,
  syncSettlementsForDay,
  toSettlementLine,
  toSettlementRecord,
} = await import("./settlement");

import type { SettlementToRecord } from "@pi-dash/db/queries/razorpay-settlements";

import { createRazorpayClient, type RazorpayClient } from "./api";
import type { RazorpaySetup } from "./config";
import {
  type RazorpayReconItem,
  razorpayReconItemSchema,
  razorpaySettlementSchema,
} from "./settlement-schema";

/** Razorpay's documented settlement recon sample (Settlements API, fetch recon). */
const DOC_RECON = [
  {
    amount: 100_000,
    card_issuer: "KARB",
    card_network: "MasterCard",
    card_type: "credit",
    created_at: 1_567_692_556,
    credit: 97_100,
    credit_type: "default",
    currency: "INR",
    debit: 0,
    description: "Recurring Payment via Subscription",
    dispute_id: null,
    entity_id: "pay_DEXrnipqTmWVGE",
    fee: 2900,
    method: "card",
    notes: "Beam me up Scotty.",
    on_hold: false,
    order_id: "order_DEXrnRiR3SNDHA",
    order_receipt: null,
    payment_id: null,
    posted_at: null,
    settled: true,
    settled_at: 1_568_176_960,
    settlement_id: "setl_DGlQ1Rj8os78Ec",
    settlement_utr: "1568176960vxp0rj",
    tax: 0,
    type: "payment",
  },
  {
    amount: 242_500,
    created_at: 1_568_107_224,
    credit: 0,
    currency: "INR",
    debit: 242_500,
    entity_id: "rfnd_DGRcGzZSLyEdg1",
    fee: 0,
    notes: "Beam me up Scotty.",
    payment_id: "pay_DEXq1pACSqFxtS",
    settled: true,
    settled_at: 1_568_176_960,
    settlement_id: "setl_DGlQ1Rj8os78Ec",
    settlement_utr: "1568176960vxp0rj",
    tax: 0,
    type: "refund",
  },
  {
    amount: 100_000,
    created_at: 1_567_681_786,
    credit: 0,
    currency: "INR",
    debit: 100_296,
    entity_id: "trf_DEUoCEtdsJgvl7",
    fee: 296,
    notes: null,
    payment_id: "pay_DEApNNTR6xmqJy",
    settled: true,
    settled_at: 1_568_176_960,
    settlement_id: "setl_DGlQ1Rj8os78Ec",
    settlement_utr: "1568176960vxp0rj",
    tax: 46,
    type: "transfer",
  },
  {
    amount: 1012,
    created_at: 1_567_681_786,
    credit: 1012,
    currency: "INR",
    debit: 0,
    description: "test reason",
    entity_id: "adj_EhcHONhX4ChgNC",
    fee: 0,
    notes: null,
    payment_id: null,
    settled: true,
    settled_at: 1_568_176_960,
    settlement_id: "setl_DGlQ1Rj8os78Ec",
    settlement_utr: null,
    tax: 0,
    type: "adjustment",
  },
];

/** Razorpay's documented settlement entity (Settlements API, fetch all). */
const DOC_SETTLEMENT = {
  amount: 9_973_635,
  created_at: 1_568_176_960,
  entity: "settlement",
  fees: 0,
  id: "setl_DGlQ1Rj8os78Ec",
  status: "processed",
  tax: 0,
  utr: "1568176960vxp0rj",
};

const recon = (raw: unknown): RazorpayReconItem =>
  razorpayReconItemSchema.parse(raw);

describe("settlement parsing", () => {
  it("reads Razorpay's documented settlement and recon fields", () => {
    expect(razorpaySettlementSchema.parse(DOC_SETTLEMENT)).toEqual({
      amount: 9_973_635,
      created_at: 1_568_176_960,
      fees: 0,
      id: "setl_DGlQ1Rj8os78Ec",
      status: "processed",
      tax: 0,
      utr: "1568176960vxp0rj",
    });
    const items = DOC_RECON.map(recon);
    expect(items.map((item) => item.type)).toEqual([
      "payment",
      "refund",
      "transfer",
      "adjustment",
    ]);
  });

  it("never keeps notes, descriptions, orders or card details", () => {
    const item = recon(DOC_RECON[0]);
    for (const key of [
      "notes",
      "description",
      "order_id",
      "card_issuer",
      "method",
      "payment_id",
    ]) {
      expect(item).not.toHaveProperty(key);
    }
  });

  it("refuses an unknown status or a settlement ID of the wrong shape", () => {
    expect(
      razorpaySettlementSchema.safeParse({ ...DOC_SETTLEMENT, status: "odd" })
        .success
    ).toBe(false);
    expect(
      razorpayReconItemSchema.safeParse({
        ...DOC_RECON[0],
        settlement_id: "not-a-settlement",
      }).success
    ).toBe(false);
  });
});

describe("settlement lines", () => {
  it("keeps the fee net of GST, as contributions do", () => {
    const transfer = toSettlementLine(recon(DOC_RECON[2]), 0);
    expect(transfer).toMatchObject({
      debitPaise: 100_296,
      externalId: "trf_DEUoCEtdsJgvl7",
      feePaise: 250,
      taxPaise: 46,
      type: "transfer",
    });
    expect(transfer?.settledAt.getTime()).toBe(1_568_176_960_000);
  });

  it("skips lines not settled, in another currency or with no settlement", () => {
    expect(
      toSettlementLine(recon({ ...DOC_RECON[0], settled: false }), 0)
    ).toBeNull();
    expect(
      toSettlementLine(recon({ ...DOC_RECON[0], currency: "USD" }), 0)
    ).toBeNull();
    expect(
      toSettlementLine(recon({ ...DOC_RECON[0], settlement_id: null }), 0)
    ).toBeNull();
  });

  it("dates a settlement in India and keeps only its own lines", () => {
    const record = toSettlementRecord(
      razorpaySettlementSchema.parse(DOC_SETTLEMENT),
      [
        ...DOC_RECON.map(recon),
        recon({
          ...DOC_RECON[0],
          entity_id: "pay_Other",
          settlement_id: "setl_Other",
        }),
      ],
      "live"
    );
    // 1568176960 is 11 Sep 2019, 10:12 IST.
    expect(record.settledOn).toBe("2019-09-11");
    expect(record.lines).toHaveLength(4);
    expect(record.utr).toBe("1568176960vxp0rj");
    expect(record.status).toBe("processed");
  });

  it("turns an India day into the recon query", () => {
    expect(reconDayOf("2026-10-07")).toEqual({ day: 7, month: 10, year: 2026 });
    expect(() => reconDayOf("7 Oct")).toThrow();
  });
});

const KEY = { id: "rzp_test_x", secret: "k" };
const enabled = (
  apiKey: { id: string; secret: string } | null = KEY,
  testInProduction = false
): RazorpaySetup => ({
  apiKey,
  enabled: true,
  mode: "test",
  testInProduction,
  webhookSecret: "w",
});

function fakeClient({
  listed = [DOC_SETTLEMENT],
  reconByDay = {},
  fetched = {},
}: {
  fetched?: Record<string, unknown>;
  listed?: unknown[];
  reconByDay?: Record<string, unknown[]>;
} = {}) {
  const calls: string[] = [];
  const client = {
    fetchSettlement: async (id: string) => {
      calls.push(`fetch:${id}`);
      const found = fetched[id];
      return found ? razorpaySettlementSchema.parse(found) : null;
    },
    listSettlementRecon: async (day: {
      day: number;
      month: number;
      year: number;
    }) => {
      const key = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
      calls.push(`recon:${key}`);
      return {
        items: (reconByDay[key] ?? []).map(recon),
        pages: 1,
        unreadable: 0,
      };
    },
    listSettlements: async () => {
      calls.push("list");
      return {
        items: listed.map((s) => razorpaySettlementSchema.parse(s)),
        pages: 1,
        unreadable: 0,
      };
    },
  } as unknown as RazorpayClient;
  return { calls, client };
}

const recorded = () => {
  const records: SettlementToRecord[] = [];
  const record = mock(async (input: SettlementToRecord) => {
    records.push(input);
    return {
      amountChanged: input.externalId === "setl_Changed",
      created: input.externalId !== "setl_Known",
      linked: input.lines.filter((l) => l.type === "payment").length,
      settlementId: `id-${input.externalId}`,
      unlinked: input.lines.filter((l) => l.type === "refund").length,
    };
  });
  return { record, records };
};

describe("syncSettlementsForDay", () => {
  it("records the day's settlements with their recon lines and tallies them", async () => {
    const { calls, client } = fakeClient({
      fetched: {
        setl_Changed: { ...DOC_SETTLEMENT, amount: 500, id: "setl_Changed" },
      },
      reconByDay: {
        "2019-09-11": [
          ...DOC_RECON,
          {
            ...DOC_RECON[0],
            entity_id: "pay_Late",
            settlement_id: "setl_Changed",
          },
        ],
      },
    });
    const { record, records } = recorded();
    const failures: string[] = [];
    const { pages, tally } = await syncSettlementsForDay(
      "2019-09-11",
      { from: 1, to: 2 },
      client,
      "test",
      { logFailure: (item) => failures.push(item.settlementId), record }
    );
    // The listing missed setl_Changed; the recon named it, so it was fetched.
    expect(calls).toEqual(["list", "recon:2019-09-11", "fetch:setl_Changed"]);
    expect(pages).toBe(3);
    expect(records.map((r) => [r.externalId, r.lines.length])).toEqual([
      ["setl_DGlQ1Rj8os78Ec", 4],
      ["setl_Changed", 1],
    ]);
    expect(tally).toEqual({
      changed: 1,
      errors: 0,
      found: 2,
      linked: 2,
      new: 2,
      unlinked: 1,
    });
    expect(failures).toEqual([]);
  });

  it("counts a settlement that fails to record and one that cannot be fetched", async () => {
    const { client } = fakeClient({
      reconByDay: {
        "2019-09-11": [{ ...DOC_RECON[0], settlement_id: "setl_Gone" }],
      },
    });
    const failures: string[] = [];
    const { tally } = await syncSettlementsForDay(
      "2019-09-11",
      { from: 1, to: 2 },
      client,
      "test",
      {
        logFailure: (item) => failures.push(item.settlementId),
        record: async () => {
          throw new Error("db down");
        },
      }
    );
    expect(tally.errors).toBe(2);
    expect(tally.found).toBe(0);
    expect(failures).toEqual(["setl_DGlQ1Rj8os78Ec"]);
  });
});

describe("syncRazorpaySettlement", () => {
  const now = () => new Date("2019-09-20T06:00:00Z");

  it("is off without Razorpay, without the key secret, and with a test key in production", async () => {
    const { client } = fakeClient();
    const { record } = recorded();
    const deps = { client: () => client, now, record };
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_A" },
        { enabled: false },
        deps
      )
    ).toEqual({ outcome: "disabled" });
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_A" },
        enabled(null),
        deps
      )
    ).toEqual({ outcome: "no_key_secret" });
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_A" },
        enabled(KEY, true),
        deps
      )
    ).toEqual({ outcome: "test_mode_refused" });
    expect(record).not.toHaveBeenCalled();
  });

  it("fetches the settlement and the recon of its India day", async () => {
    const { calls, client } = fakeClient({
      fetched: { setl_DGlQ1Rj8os78Ec: DOC_SETTLEMENT },
      reconByDay: { "2019-09-11": DOC_RECON },
    });
    const { record, records } = recorded();
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_DGlQ1Rj8os78Ec" },
        enabled(),
        { client: () => client, now, record }
      )
    ).toEqual({
      created: true,
      lines: 4,
      linked: 1,
      outcome: "recorded",
      unlinked: 1,
    });
    expect(calls).toEqual(["fetch:setl_DGlQ1Rj8os78Ec", "recon:2019-09-11"]);
    expect(records[0]?.mode).toBe("test");
  });

  it("looks at the next day when the settlement's own day lists none of its lines", async () => {
    const { calls, client } = fakeClient({
      fetched: { setl_DGlQ1Rj8os78Ec: DOC_SETTLEMENT },
      reconByDay: { "2019-09-12": DOC_RECON },
    });
    const { record } = recorded();
    const outcome = await syncRazorpaySettlement(
      { settlementId: "setl_DGlQ1Rj8os78Ec" },
      enabled(),
      { client: () => client, now, record }
    );
    expect(calls).toEqual([
      "fetch:setl_DGlQ1Rj8os78Ec",
      "recon:2019-09-11",
      "recon:2019-09-12",
    ]);
    expect(outcome).toMatchObject({ lines: 4, outcome: "recorded" });
  });

  it("records nothing for a settlement Razorpay does not know", async () => {
    const { client } = fakeClient();
    const { record } = recorded();
    expect(
      await syncRazorpaySettlement({ settlementId: "setl_X" }, enabled(), {
        client: () => client,
        now,
        record,
      })
    ).toEqual({ outcome: "not_found" });
    expect(record).not.toHaveBeenCalled();
  });
});

describe("settlement API calls", () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });

  it("pages the recon of one day a thousand lines at a time", async () => {
    const urls: string[] = [];
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({
        ...DOC_RECON[0],
        entity_id: `pay_P${i}`,
      })),
      [DOC_RECON[3]],
    ];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return json({ entity: "collection", items: pages.shift() ?? [] });
    }) as unknown as typeof fetch;
    const listing = await createRazorpayClient(KEY, {
      fetchImpl,
    }).listSettlementRecon({ day: 11, month: 9, year: 2019 });
    expect(listing.items).toHaveLength(1001);
    expect(urls).toEqual([
      "https://api.razorpay.com/v1/settlements/recon/combined?count=1000&day=11&month=9&year=2019&skip=0",
      "https://api.razorpay.com/v1/settlements/recon/combined?count=1000&day=11&month=9&year=2019&skip=1000",
    ]);
  });

  it("lists settlements by time window and fetches one by ID", async () => {
    const urls: string[] = [];
    const answers = [
      () => json({ entity: "collection", items: [DOC_SETTLEMENT] }),
      () => json(DOC_SETTLEMENT),
      () => new Response("", { status: 404 }),
    ];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      const next = answers.shift();
      if (!next) {
        throw new Error("No more answers");
      }
      return next();
    }) as unknown as typeof fetch;
    const client = createRazorpayClient(KEY, { fetchImpl });
    expect(
      (await client.listSettlements({ from: 10, to: 20 })).items
    ).toHaveLength(1);
    expect((await client.fetchSettlement("setl_DGlQ1Rj8os78Ec"))?.amount).toBe(
      9_973_635
    );
    expect(await client.fetchSettlement("setl_Missing")).toBeNull();
    expect(urls).toEqual([
      "https://api.razorpay.com/v1/settlements?count=100&from=10&to=20&skip=0",
      "https://api.razorpay.com/v1/settlements/setl_DGlQ1Rj8os78Ec",
      "https://api.razorpay.com/v1/settlements/setl_Missing",
    ]);
  });
});
