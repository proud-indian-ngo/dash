import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  type ClassifyRowInput,
  classifyRows,
  fillsChosenDonor,
  planRows,
  summarizePlans,
} from "./classify";
import {
  compareHeaders,
  defaultGiveDoAccount,
  GIVE_DO_COLUMNS,
  GIVE_DO_HEADERS,
  IGNORE_FIELD,
  sourceRules,
  suggestMapping,
} from "./fields";
import { identityKey, payloadHash, rowIdentity } from "./identity";
import { FOREIGN_CURRENCY_MESSAGE, normalizeRow } from "./normalize";
import { parseCsv } from "./parse-csv";

/** The synthetic give.do export the E2E suite uploads, with its per-run placeholders filled. */
const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../packages/e2e/fixtures/income/give-do-sample.csv"
);
const ACCOUNT = "0190a000-0000-7000-8000-0000000000aa";
const PAN_A = "ABCDE1234F";
const PAN_C = "PQRST6789K";

function fixture() {
  const text = readFileSync(FIXTURE, "utf8")
    .replaceAll("{RUN}", "t1")
    .replaceAll("{PAN_A}", PAN_A)
    .replaceAll("{PAN_C}", PAN_C)
    .replace(/\{PHONE_([A-E])\}/g, (_, letter: string) => {
      const digit = "ABCDE".indexOf(letter) + 1;
      return `+9198765${String(digit).repeat(5)}`;
    });
  return parseCsv(text);
}

const giveDo = sourceRules("give_do_csv");

function normalizedFixture() {
  const parsed = fixture();
  const mapping = suggestMapping(parsed.headers, null, "give_do_csv");
  return parsed.rows.map((raw) =>
    normalizeRow(raw, mapping, {
      dateFormat: giveDo.fixedDateFormat ?? "dmy",
      defaultChannel: giveDo.fixedChannel ?? "give_do",
      idType: giveDo.idType,
      today: "2026-10-13",
    })
  );
}

describe("give.do preset", () => {
  it("matches the fixture's header to the give.do export, column for column", () => {
    expect(fixture().headers).toEqual([...GIVE_DO_HEADERS]);
    expect(GIVE_DO_HEADERS).toHaveLength(19);
  });

  it("maps every give.do column, ignoring time, joined address, subscription and tags", () => {
    const mapping = suggestMapping(GIVE_DO_HEADERS, null, "give_do_csv");
    expect(mapping).toEqual(Object.fromEntries(GIVE_DO_COLUMNS));
    expect(mapping).toMatchObject({
      Date: "receivedOn",
      "Donation Amount": "amount",
      "Donation Currency": "currency",
      "Donor Complete Address": IGNORE_FIELD,
      "Donor PAN": "idNumber",
      "Donor Zipcode / Pincode": "pincode",
      "Parent Donation": IGNORE_FIELD,
      "Subscription Type": IGNORE_FIELD,
      tags: IGNORE_FIELD,
      Time: IGNORE_FIELD,
      "Transaction ID": "externalId",
    });
  });

  it("prefers the preset over a remembered mapping, and keeps synonyms for other headers", () => {
    const mapping = suggestMapping(
      ["Donor PAN", "Date", "Remarks"],
      { Date: IGNORE_FIELD, "Donor PAN": "notes" },
      "give_do_csv"
    );
    expect(mapping).toEqual({
      Date: "receivedOn",
      "Donor PAN": "idNumber",
      Remarks: "notes",
    });
  });

  it("matches the preset's headers however the file cases or spaces them", () => {
    const mapping = suggestMapping(
      ["DONOR PAN", "donation currency", "Transaction_ID"],
      { "DONOR PAN": "notes" },
      "give_do_csv"
    );
    expect(mapping).toEqual({
      "DONOR PAN": "idNumber",
      Transaction_ID: "externalId",
      "donation currency": "currency",
    });
    const headers = GIVE_DO_HEADERS.map((h) => h.toUpperCase());
    expect(compareHeaders(headers, GIVE_DO_HEADERS)).toEqual({
      extra: [],
      missing: [],
    });
  });

  it("fixes day-first dates, the give.do channel and PAN as the ID type", () => {
    expect(giveDo).toEqual({
      expectedHeaders: GIVE_DO_HEADERS,
      fixedChannel: "give_do",
      fixedDateFormat: "dmy",
      idType: "pan",
    });
    expect(sourceRules("generic_csv").fixedDateFormat).toBeNull();
  });

  it("flags missing and extra columns against the export format", () => {
    const headers = GIVE_DO_HEADERS.filter((h) => h !== "Donor PAN");
    expect(compareHeaders([...headers, "Campaign"], GIVE_DO_HEADERS)).toEqual({
      extra: ["Campaign"],
      missing: ["Donor PAN"],
    });
    expect(compareHeaders(GIVE_DO_HEADERS, GIVE_DO_HEADERS)).toEqual({
      extra: [],
      missing: [],
    });
  });

  it("defaults to the active gateway clearing account named for give.do", () => {
    const accounts = [
      { id: "bank", kind: "bank", name: "give.do bank" },
      { id: "rzp", kind: "gateway_clearing", name: "Razorpay clearing" },
      { id: "gd", kind: "gateway_clearing", name: "GiveIndia clearing" },
    ];
    expect(defaultGiveDoAccount(accounts)?.id).toBe("gd");
    expect(
      defaultGiveDoAccount([
        { id: "gd2", kind: "gateway_clearing", name: "give.do clearing" },
      ])?.id
    ).toBe("gd2");
    expect(defaultGiveDoAccount(accounts.slice(0, 2))).toBeUndefined();
  });
});

describe("give.do rows", () => {
  it("reads dates, phones, PANs and addresses as give.do writes them", () => {
    const [first, noPan] = normalizedFixture();
    expect(first?.errors).toEqual([]);
    expect(first?.row).toMatchObject({
      addressLine1: "12 Test Lane",
      addressLine2: "",
      amountPaise: 150_000,
      channel: "give_do",
      city: "Bengaluru",
      country: "IN",
      donationType: "voluntary",
      externalId: "LCt1A1",
      idNumber: PAN_A,
      idType: "pan",
      phone: "+919876511111",
      pincode: "560001",
      receivedOn: "2024-06-04",
      state: "Karnataka",
    });
    expect(noPan?.errors).toEqual([]);
    expect(noPan?.row).toMatchObject({ idNumber: "", idType: "none" });
  });

  it("never imports a non-INR gift as domestic", () => {
    const abroad = normalizedFixture()[4];
    expect(abroad?.errors).toContainEqual({
      field: "currency",
      message: FOREIGN_CURRENCY_MESSAGE,
    });
    const mapping = {
      Amount: "amount",
      Currency: "currency",
      Date: "receivedOn",
      Name: "donorName",
    } as const;
    const options = {
      dateFormat: "dmy",
      defaultChannel: "upi",
      today: "2026-10-13",
    } as const;
    const base = { Amount: "10", Date: "01/10/2026", Name: "Asha" };
    for (const currency of ["INR", "inr", "₹", ""]) {
      expect(
        normalizeRow({ ...base, Currency: currency }, mapping, options).errors
      ).toEqual([]);
    }
    expect(
      normalizeRow({ ...base, Currency: "EUR" }, mapping, options).errors
    ).toEqual([{ field: "currency", message: FOREIGN_CURRENCY_MESSAGE }]);
  });

  it("warns, rather than guesses, when the PAN column holds something else", () => {
    const parsed = fixture();
    const mapping = suggestMapping(parsed.headers, null, "give_do_csv");
    const result = normalizeRow(
      { ...parsed.rows[0], "Donor PAN": "12345678" },
      mapping,
      {
        dateFormat: "dmy",
        defaultChannel: "give_do",
        idType: "pan",
        today: "2026-10-13",
      }
    );
    expect(result.errors).toEqual([]);
    expect(result.row.idType).toBe("none");
    expect(result.warnings[0]?.message).toContain("Invalid PAN");
  });

  it("makes one donor of rows sharing a PAN and errors the foreign row", () => {
    const inputs: ClassifyRowInput[] = normalizedFixture().map((n, i) => {
      const usable = n.errors.length === 0;
      return {
        id: `row-${i + 1}`,
        identityKey: usable
          ? identityKey(rowIdentity(n.row, "give_do_csv", ACCOUNT))
          : null,
        normalized: n,
        outcome: "pending",
        payloadHash: usable ? payloadHash(n.row) : null,
        rowNumber: i + 1,
      };
    });
    const classified = classifyRows(inputs, {
      emailMatches: new Map(),
      existingContributions: [],
      identities: new Map(),
      idMatches: new Map(),
      phoneMatches: new Map(),
    });
    expect(classified.map((c) => c.category)).toEqual([
      "new_donor",
      "new_donor",
      "new_donor",
      "new_donor",
      "error",
      "new_donor",
    ]);
    expect(classified[2]?.donor).toEqual(classified[0]?.donor);
    expect(summarizePlans(planRows(classified, {}).values())).toEqual({
      conflicts: 0,
      errors: 1,
      imports: 5,
      links: 0,
      newDonors: 4,
      skips: 0,
    });
  });
});

describe("fillsChosenDonor", () => {
  const options = [
    { kind: "existing", name: "A", partyId: "p-email", reason: "email" },
    { kind: "existing", name: "B", partyId: "p-id", reason: "id_number" },
  ] as const;
  const row = {
    donor: { kind: "undecided" } as const,
    donorOptions: [...options],
    sameDonorAs: null,
  };

  it("fills for an accepted email or phone match unless turned off", () => {
    expect(fillsChosenDonor(row, { donor: "party:p-email" })).toBe(true);
    expect(
      fillsChosenDonor(row, { donor: "party:p-email", fillMissing: false })
    ).toBe(false);
  });

  it("never fills for an ID-number match, a new donor or a follower row", () => {
    expect(fillsChosenDonor(row, { donor: "party:p-id" })).toBe(false);
    expect(fillsChosenDonor(row, { donor: "new" })).toBe(false);
    expect(
      fillsChosenDonor(
        { ...row, sameDonorAs: { rowId: "r", rowNumber: 1 } },
        { donor: "party:p-email" }
      )
    ).toBe(false);
  });

  it("plans a fill only on the row where the match was accepted", () => {
    const plans = planRows(
      [
        {
          category: "needs_review",
          donor: { kind: "undecided" },
          donorOptions: [...options],
          duplicate: null,
          errors: [],
          identityKey: "k",
          linkTo: null,
          repeatOf: null,
          rowId: "r1",
          rowNumber: 1,
          sameDonorAs: null,
          warnings: [],
        },
      ],
      { r1: { donor: "party:p-email" } }
    );
    expect(plans.get("r1")).toEqual({
      action: "import",
      donor: { kind: "existing", partyId: "p-email" },
      fill: true,
    });
    expect(summarizePlans(plans.values()).imports).toBe(1);
  });
});
