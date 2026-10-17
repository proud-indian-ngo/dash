import { describe, expect, it } from "bun:test";

import {
  type ClassifyContext,
  type ClassifyRowInput,
  classifyRows,
  idMatchKey,
} from "@/lib/income-import/classify";

import { DEFAULT_NOTES_KEYS, type NotesKeys } from "./notes-keys";
import {
  flattenPayment,
  isCapturedPayment,
  istDayOf,
  MAX_NOTE_VALUE_LENGTH,
  MAX_STORED_NOTES,
  normalizeRazorpayRow,
  parseRazorpayBatchKey,
  type RazorpayPayment,
  razorpayBatchKey,
  razorpayBatchName,
  razorpayMode,
  razorpayPayloadHash,
} from "./payment";

const unix = (iso: string) => Date.parse(iso) / 1000;
const PAN = "ABCDE1234F";

const payment = (
  overrides: Partial<RazorpayPayment> = {}
): RazorpayPayment => ({
  amount: 250_050,
  contact: "+919876543210",
  created_at: unix("2026-10-12T05:00:00Z"),
  currency: "INR",
  email: "Asha@Example.test",
  fee: 5900,
  id: "pay_Test0001",
  method: "upi",
  notes: { "Full Name": "Asha Rao", "PAN Number": PAN, city: "Bengaluru" },
  status: "captured",
  tax: 900,
  ...overrides,
});

const normalize = (p: RazorpayPayment, keys: NotesKeys = DEFAULT_NOTES_KEYS) =>
  normalizeRazorpayRow(flattenPayment(p, keys), keys);

describe("flattenPayment", () => {
  it("keeps allow-listed fields and notes as strings under dot keys", () => {
    const raw = flattenPayment(
      {
        ...payment(),
        // Card details from the API never reach the row.
        ...({ card: { last4: "1111" }, vpa: "asha@upi" } as object),
      } as RazorpayPayment,
      DEFAULT_NOTES_KEYS
    );
    expect(raw).toMatchObject({
      amount: "250050",
      contact: "+919876543210",
      currency: "INR",
      fee: "5900",
      id: "pay_Test0001",
      "notes.Full Name": "Asha Rao",
      "notes.PAN Number": PAN,
      tax: "900",
    });
    expect(Object.keys(raw).some((k) => k.startsWith("card"))).toBe(false);
    expect(raw).not.toHaveProperty("vpa");
  });

  it("drops null fields and Razorpay's empty notes array", () => {
    const raw = flattenPayment(
      payment({ fee: null, notes: [], tax: null }),
      DEFAULT_NOTES_KEYS
    );
    expect(raw).not.toHaveProperty("fee");
    expect(raw).not.toHaveProperty("tax");
    expect(Object.keys(raw).some((k) => k.startsWith("notes."))).toBe(false);
  });
});

describe("flattenPayment: notes kept", () => {
  const notesOf = (raw: Record<string, string>) =>
    Object.keys(raw).filter((k) => k.startsWith("notes."));

  it("keeps only notes whose key the settings or defaults read, ignoring case and punctuation", () => {
    const keys: NotesKeys = { ...DEFAULT_NOTES_KEYS, name: ["Donor Name"] };
    const raw = flattenPayment(
      payment({
        notes: {
          "DONOR-NAME": "Asha Rao",
          "Full Name": "Also Asha",
          "Mother's maiden name": "Kept out",
          "PAN Number": PAN,
          purpose: "In memory of a relative",
        },
      }),
      keys
    );
    expect(notesOf(raw).sort()).toEqual([
      "notes.DONOR-NAME",
      "notes.Full Name",
      "notes.PAN Number",
    ]);
  });

  it("keeps at most 20 notes and cuts each value to 500 characters", () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${i}`, "v"])
    );
    const keys: NotesKeys = {
      ...DEFAULT_NOTES_KEYS,
      address: Object.keys(many).slice(0, 8),
      city: Object.keys(many).slice(8, 16),
      state: Object.keys(many).slice(16, 24),
      pincode: Object.keys(many).slice(24, 30),
    };
    const raw = flattenPayment(
      payment({ notes: { ...many, address: "x".repeat(900) } }),
      keys
    );
    expect(notesOf(raw)).toHaveLength(MAX_STORED_NOTES);
    const long = flattenPayment(
      payment({ notes: { address: "x".repeat(900) } }),
      DEFAULT_NOTES_KEYS
    );
    expect(long["notes.address"]).toHaveLength(MAX_NOTE_VALUE_LENGTH);
  });
});

describe("normalizeRazorpayRow", () => {
  it("maps a captured INR payment to contribution values in paise", () => {
    const { errors, row, warnings } = normalize(payment());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(row).toMatchObject({
      amountPaise: 250_050,
      channel: "razorpay",
      city: "Bengaluru",
      donationType: "voluntary",
      donorName: "Asha Rao",
      email: "asha@example.test",
      externalId: "pay_Test0001",
      idNumber: PAN,
      idType: "pan",
      phone: "+919876543210",
      receivedOn: "2026-10-12",
      reference: "pay_Test0001",
    });
  });

  it("splits Razorpay's fee into fee before GST and the GST itself", () => {
    const { row } = normalize(payment({ fee: 5900, tax: 900 }));
    expect(row.gatewayFeePaise).toBe(5000);
    expect(row.gatewayTaxPaise).toBe(900);
  });

  it("treats a missing fee and tax as zero", () => {
    const { errors, row } = normalize(payment({ fee: null, tax: null }));
    expect(errors).toEqual([]);
    expect(row.gatewayFeePaise).toBe(0);
    expect(row.gatewayTaxPaise).toBe(0);
  });

  it("dates the payment by its India day, at both edges of the day", () => {
    expect(
      normalize(payment({ created_at: unix("2026-10-12T18:29:59Z") })).row
        .receivedOn
    ).toBe("2026-10-12");
    expect(
      normalize(payment({ created_at: unix("2026-10-12T18:30:00Z") })).row
        .receivedOn
    ).toBe("2026-10-13");
    expect(istDayOf(unix("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
  });

  it("refuses payments not in INR or not captured", () => {
    const usd = normalize(payment({ currency: "USD" }));
    expect(usd.errors).toContainEqual({
      field: "currency",
      message: "Foreign currency: FCRA is not activated",
    });
    expect(usd.errors.map((e) => e.message).join()).not.toContain("USD");
    expect(usd.row.amountPaise).toBeNull();
    expect(normalize(payment({ status: "refunded" })).errors).toHaveLength(1);
  });

  it("imports a captured payment refunded since, but not one never captured", () => {
    const refunded = normalize(
      payment({ amount_refunded: 250_050, captured: true, status: "refunded" })
    );
    expect(refunded.errors).toEqual([]);
    expect(refunded.row.amountPaise).toBe(250_050);
    expect(
      normalize(payment({ captured: false, status: "refunded" })).errors
    ).toHaveLength(1);
    expect(
      normalize(payment({ captured: false, status: "authorized" })).errors
    ).toHaveLength(1);
  });

  it("tells a captured payment by its captured flag, falling back to the status", () => {
    expect(isCapturedPayment({ captured: true, status: "refunded" })).toBe(
      true
    );
    expect(isCapturedPayment({ captured: "true", status: "refunded" })).toBe(
      true
    );
    expect(isCapturedPayment({ captured: false, status: "captured" })).toBe(
      false
    );
    expect(isCapturedPayment({ status: "captured" })).toBe(true);
    expect(isCapturedPayment({ status: "refunded" })).toBe(false);
  });

  it("reads notes through the configured keys, ignoring case and punctuation", () => {
    const keys: NotesKeys = {
      ...DEFAULT_NOTES_KEYS,
      name: ["donor"],
      pan: ["tax_id"],
    };
    const { row } = normalize(
      payment({ notes: { DONOR: "Ravi K", "Tax ID": "abcde 1234 f" } }),
      keys
    );
    expect(row.donorName).toBe("Ravi K");
    expect(row.idNumber).toBe(PAN);
  });

  it("keeps an invalid PAN out and says so", () => {
    const { row, warnings } = normalize(
      payment({ notes: { name: "Asha Rao", pan: "NOTAPAN" } })
    );
    expect(row.idType).toBe("none");
    expect(row.idNumber).toBe("");
    expect(warnings.map((w) => w.message)).toContain(
      "Invalid PAN; the donor is saved without an ID"
    );
  });

  it("names a donor without a name after their contact, and errors with neither", () => {
    const named = normalize(payment({ notes: [] }));
    expect(named.errors).toEqual([]);
    expect(named.row.donorName).toBe("asha@example.test");
    expect(named.warnings).toHaveLength(1);
    const nameless = normalize(
      payment({ contact: null, email: null, notes: [] })
    );
    expect(nameless.errors.map((e) => e.field)).toContain("donorName");
  });

  it("shortens over-long notes instead of refusing the payment", () => {
    const { errors, row, warnings } = normalize(
      payment({ notes: { address: "x".repeat(250), name: "Asha Rao" } })
    );
    expect(errors).toEqual([]);
    expect(row.addressLine1).toHaveLength(200);
    expect(warnings).toHaveLength(1);
  });
});

describe("razorpayPayloadHash", () => {
  const hash = (p: RazorpayPayment) =>
    razorpayPayloadHash(flattenPayment(p, DEFAULT_NOTES_KEYS));

  it("is the same for a repeated delivery, whatever the notes order or refund state", () => {
    const first = hash(payment());
    expect(
      hash(
        payment({
          notes: {
            city: "Bengaluru",
            "Full Name": "Asha Rao",
            "PAN Number": PAN,
          },
        })
      )
    ).toBe(first);
    expect(
      razorpayPayloadHash({
        ...flattenPayment(payment(), DEFAULT_NOTES_KEYS),
        amount_refunded: "250050",
        refund_status: "full",
        status: "refunded",
      })
    ).toBe(first);
  });

  it("changes when what the donor paid or said changes", () => {
    const first = hash(payment());
    expect(hash(payment({ amount: 250_000 }))).not.toBe(first);
    expect(hash(payment({ notes: { name: "Someone Else" } }))).not.toBe(first);
  });
});

describe("mode and batch key", () => {
  it("takes the mode from the key id's prefix", () => {
    expect(razorpayMode("rzp_test_abc")).toBe("test");
    expect(razorpayMode("rzp_live_abc")).toBe("live");
  });

  it("round-trips the batch key and names test batches", () => {
    const key = razorpayBatchKey("test", "2026-10-12");
    expect(parseRazorpayBatchKey(key)).toEqual({
      day: "2026-10-12",
      mode: "test",
    });
    expect(parseRazorpayBatchKey("0a1b2c")).toBeNull();
    expect(razorpayBatchName("test", "2026-10-12")).toBe(
      "Razorpay payments, 12 Oct 2026 (test mode)"
    );
    expect(razorpayBatchName("live", "2026-10-12")).toBe(
      "Razorpay payments, 12 Oct 2026"
    );
  });
});

describe("donor rules for Razorpay payments (shared classification)", () => {
  const empty: ClassifyContext = {
    emailMatches: new Map(),
    existingContributions: [],
    identities: new Map(),
    idMatches: new Map(),
    nameMatches: new Map(),
    phoneMatches: new Map(),
  };
  const input = (p: RazorpayPayment, rowNumber = 1): ClassifyRowInput => {
    const raw = flattenPayment(p, DEFAULT_NOTES_KEYS);
    return {
      id: `row-${rowNumber}`,
      identityKey: `razorpay\u0000test\u0000payment\u0000${p.id}`,
      normalized: normalizeRazorpayRow(raw, DEFAULT_NOTES_KEYS),
      outcome: "pending",
      payloadHash: razorpayPayloadHash(raw),
      rowNumber,
    };
  };
  const donor = { name: "Asha Rao", partyId: "party-1" };

  it("links a PAN that matches one donor without asking", () => {
    const [row] = classifyRows([input(payment())], {
      ...empty,
      idMatches: new Map([[idMatchKey("pan", PAN), [donor]]]),
    });
    expect(row?.category).toBe("ready");
    expect(row?.donor).toEqual({ kind: "existing", ...donor });
  });

  it("creates a donor for a new PAN", () => {
    const [row] = classifyRows([input(payment())], empty);
    expect(row?.category).toBe("new_donor");
  });

  it("asks a reviewer when only the email or phone matches a donor", () => {
    const noPan = payment({ notes: { name: "Asha Rao" } });
    const [byEmail] = classifyRows([input(noPan)], {
      ...empty,
      emailMatches: new Map([["asha@example.test", [donor]]]),
    });
    expect(byEmail?.category).toBe("needs_review");
    const [byPhone] = classifyRows([input(noPan)], {
      ...empty,
      phoneMatches: new Map([["+919876543210", [donor]]]),
    });
    expect(byPhone?.category).toBe("needs_review");
  });

  it("creates a donor without an ID when the PAN is invalid and nothing matches", () => {
    const [row] = classifyRows(
      [input(payment({ notes: { name: "Asha Rao", pan: "BAD" } }))],
      empty
    );
    expect(row?.category).toBe("new_donor");
    expect(row?.warnings).toHaveLength(1);
  });

  it("asks a reviewer when a hand-entered gift has the same payment ID", () => {
    const [row] = classifyRows([input(payment())], {
      ...empty,
      existingContributions: [
        {
          amountPaise: 250_050,
          id: "c-1",
          partyId: "party-9",
          receivedOn: "2026-10-12",
          reference: "PAY_TEST0001",
        },
      ],
    });
    expect(row?.category).toBe("needs_review");
    expect(row?.duplicate?.reason).toBe("reference");
  });

  it("links a repeated delivery and flags a changed one as a conflict", () => {
    const first = input(payment());
    const stored = new Map([
      [
        first.identityKey ?? "",
        { contributionId: "c-1", payloadHash: first.payloadHash ?? "" },
      ],
    ]);
    const [again] = classifyRows([first], { ...empty, identities: stored });
    expect(again?.category).toBe("already_imported");
    expect(again?.linkTo).toEqual({ contributionId: "c-1" });
    const [changed] = classifyRows([input(payment({ amount: 1 }))], {
      ...empty,
      identities: stored,
    });
    expect(changed?.category).toBe("conflict");
  });
});
