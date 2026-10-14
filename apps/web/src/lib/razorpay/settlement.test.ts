import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const {
  reconDayOf,
  SettlementLinesNotReadyError,
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
  razorpayOndemandSettlementSchema,
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

/** A recon listing of readable lines, with unreadable ones counted per settlement. */
const listing = (
  items: unknown[],
  unreadable: Record<string, number> = {}
) => ({
  items: items.map(recon),
  unreadableBySettlement: new Map(Object.entries(unreadable)),
});

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
      listing([
        ...DOC_RECON,
        {
          ...DOC_RECON[0],
          entity_id: "pay_Other",
          settlement_id: "setl_Other",
        },
      ]),
      "live"
    );
    // 1568176960 is 11 Sep 2019, 10:12 IST.
    expect(record.settledOn).toBe("2019-09-11");
    expect(record.lines).toHaveLength(4);
    expect(record.utr).toBe("1568176960vxp0rj");
    expect(record.status).toBe("processed");
    // A normal settlement has no fee of its own.
    expect(record.settlementFeePaise).toBeNull();
    expect(record.settlementTaxPaise).toBeNull();
    expect(record.unreadableLines).toBe(0);
  });

  it("counts lines it cannot read: another currency, or a shape it does not know", () => {
    const record = toSettlementRecord(
      razorpaySettlementSchema.parse(DOC_SETTLEMENT),
      listing(
        [
          ...DOC_RECON,
          { ...DOC_RECON[0], currency: "USD", entity_id: "pay_Usd" },
          { ...DOC_RECON[0], entity_id: "pay_Unsettled", settled: false },
        ],
        { setl_DGlQ1Rj8os78Ec: 2, setl_Other: 5 }
      ),
      "live"
    );
    expect(record.lines).toHaveLength(4);
    expect(record.unreadableLines).toBe(3);
  });

  it("keeps an instant settlement's own fee net of its GST", () => {
    const record = toSettlementRecord(
      razorpaySettlementSchema.parse({ ...DOC_SETTLEMENT, fees: 590, tax: 90 }),
      listing([]),
      "live"
    );
    expect(record.settlementFeePaise).toBe(500);
    expect(record.settlementTaxPaise).toBe(90);
  });

  it("reads Razorpay's documented instant settlement as a settlement", () => {
    expect(
      razorpayOndemandSettlementSchema.parse({
        amount_pending: 0,
        amount_requested: 200_000,
        amount_reversed: 0,
        amount_settled: 199_410,
        created_at: 1_596_771_429,
        currency: "INR",
        description: "Need this to make vendor payments.",
        entity: "settlement.ondemand",
        fees: 590,
        id: "setlod_FNj7g2YS5J67Rz",
        notes: { notes_key_1: "Tea, Earl Grey, Hot" },
        settle_full_balance: false,
        status: "processed",
        tax: 90,
      })
    ).toEqual({
      amount: 199_410,
      created_at: 1_596_771_429,
      fees: 590,
      id: "setlod_FNj7g2YS5J67Rz",
      status: "processed",
      tax: 90,
      utr: null,
    });
    expect(
      razorpayReconItemSchema.safeParse({
        ...DOC_RECON[0],
        settlement_id: "setlod_FNj7g2YS5J67Rz",
      }).success
    ).toBe(true);
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
        unreadableBySettlement: new Map<string, number>(),
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

  it("counts a settlement once when a run sees it on two days", async () => {
    const { client } = fakeClient({ reconByDay: { "2019-09-11": DOC_RECON } });
    const { record } = recorded();
    const seen = new Set<string>();
    const deps = { logFailure: () => undefined, record };
    const first = await syncSettlementsForDay(
      "2019-09-11",
      { from: 1, to: 2 },
      client,
      "test",
      deps,
      seen
    );
    const second = await syncSettlementsForDay(
      "2019-09-11",
      { from: 1, to: 2 },
      client,
      "test",
      deps,
      seen
    );
    expect(first.tally).toMatchObject({ found: 1, new: 1, unlinked: 1 });
    expect(second.tally).toMatchObject({ found: 0, new: 0, unlinked: 0 });
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

  it("tries the day before too, and retries a processed settlement whose lines are not listed yet", async () => {
    const { calls, client } = fakeClient({
      fetched: { setl_DGlQ1Rj8os78Ec: DOC_SETTLEMENT },
      reconByDay: { "2019-09-10": DOC_RECON },
    });
    const { record } = recorded();
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_DGlQ1Rj8os78Ec" },
        enabled(),
        { client: () => client, now, record }
      )
    ).toMatchObject({ lines: 4, outcome: "recorded" });
    expect(calls.slice(1)).toEqual([
      "recon:2019-09-11",
      "recon:2019-09-12",
      "recon:2019-09-10",
    ]);

    const empty = fakeClient({
      fetched: { setl_DGlQ1Rj8os78Ec: DOC_SETTLEMENT },
    });
    const none = recorded();
    await expect(
      syncRazorpaySettlement(
        { settlementId: "setl_DGlQ1Rj8os78Ec" },
        enabled(),
        { client: () => empty.client, now, record: none.record }
      )
    ).rejects.toBeInstanceOf(SettlementLinesNotReadyError);
    expect(none.record).not.toHaveBeenCalled();

    // One not processed yet is recorded without lines.
    const created = fakeClient({
      fetched: {
        setl_DGlQ1Rj8os78Ec: { ...DOC_SETTLEMENT, status: "created" },
      },
    });
    const createdRecord = recorded();
    expect(
      await syncRazorpaySettlement(
        { settlementId: "setl_DGlQ1Rj8os78Ec" },
        enabled(),
        { client: () => created.client, now, record: createdRecord.record }
      )
    ).toMatchObject({ lines: 0, outcome: "recorded" });
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

  it("fetches an instant settlement from its own endpoint", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return json({
        amount_settled: 199_410,
        created_at: 1_596_771_429,
        fees: 590,
        id: "setlod_FNj7g2YS5J67Rz",
        status: "reversed",
        tax: 90,
      });
    }) as unknown as typeof fetch;
    const settlement = await createRazorpayClient(KEY, {
      fetchImpl,
    }).fetchSettlement("setlod_FNj7g2YS5J67Rz");
    expect(urls).toEqual([
      "https://api.razorpay.com/v1/settlements/ondemand/setlod_FNj7g2YS5J67Rz",
    ]);
    // Reversed: the money went back to the balance, so it was not paid out.
    expect(settlement).toMatchObject({ amount: 199_410, status: "failed" });
  });

  it("counts the recon lines it cannot read by the settlement they name", async () => {
    const fetchImpl = (async () =>
      json({
        entity: "collection",
        items: [
          DOC_RECON[0],
          { ...DOC_RECON[0], credit: "lots" },
          { settlement_id: "setl_DGlQ1Rj8os78Ec", type: "odd" },
          { nothing: true },
        ],
      })) as unknown as typeof fetch;
    const listed = await createRazorpayClient(KEY, {
      fetchImpl,
    }).listSettlementRecon({ day: 11, month: 9, year: 2019 });
    expect(listed.items).toHaveLength(1);
    expect(listed.unreadable).toBe(3);
    expect([...listed.unreadableBySettlement]).toEqual([
      ["setl_DGlQ1Rj8os78Ec", 2],
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
