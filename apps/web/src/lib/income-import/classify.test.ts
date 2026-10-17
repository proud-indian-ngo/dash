import { describe, expect, it } from "bun:test";

import {
  type ClassifyContext,
  type ClassifyRowInput,
  classifyRows,
  idMatchKey,
  planRows,
  summarizePlans,
} from "./classify";
import { identityKey, payloadHash, rowIdentity } from "./identity";
import { REVIEW_CATEGORY_LABELS, REVIEW_ROW_STATUS_LABELS } from "./labels";
import type { NormalizedRow } from "./normalize";
import { reviewSummaryLine, summarizeReview } from "./review-summary";
import type { ReviewRowView } from "./review-types";

const ACCOUNT = "0190a000-0000-7000-8000-0000000000aa";

function row(overrides: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    addressLine1: "",
    addressLine2: "",
    amountPaise: 100_000,
    channel: "upi",
    channelFromFile: false,
    city: "",
    country: "IN",
    donationType: "voluntary",
    donorKind: "person",
    donorName: "Asha Rao",
    email: "",
    externalId: "",
    idNumber: "",
    idType: "none",
    notes: "",
    phone: "",
    pincode: "",
    receivedOn: "2026-10-01",
    reference: "",
    state: "",
    ...overrides,
  };
}

let counter = 0;
function input(
  normalized: NormalizedRow,
  overrides: Partial<ClassifyRowInput> = {}
): ClassifyRowInput {
  counter += 1;
  const identity = rowIdentity(normalized, "generic_csv", ACCOUNT);
  return {
    id: `row-${counter}`,
    identityKey: identityKey(identity),
    normalized: { errors: [], row: normalized, warnings: [] },
    outcome: "pending",
    payloadHash: payloadHash(normalized),
    rowNumber: counter,
    ...overrides,
  };
}

const emptyContext = (): ClassifyContext => ({
  emailMatches: new Map(),
  existingContributions: [],
  identities: new Map(),
  idMatches: new Map(),
  nameMatches: new Map(),
  phoneMatches: new Map(),
});

describe("rowIdentity", () => {
  it("uses the external ID when there is one", () => {
    const identity = rowIdentity(
      row({ externalId: " GD-1 " }),
      "generic_csv",
      ACCOUNT
    );
    expect(identity).toEqual({
      entityType: "payment",
      externalId: "GD-1",
      provider: "generic",
      providerAccount: ACCOUNT,
      weak: false,
    });
  });

  it("falls back to a fingerprint that ignores case and spacing in the name", () => {
    const a = rowIdentity(
      row({ donorName: "Asha  Rao" }),
      "generic_csv",
      ACCOUNT
    );
    const b = rowIdentity(
      row({ donorName: "asha rao" }),
      "generic_csv",
      ACCOUNT
    );
    const c = rowIdentity(row({ amountPaise: 1 }), "generic_csv", ACCOUNT);
    expect(a.weak).toBe(true);
    expect(a.externalId).toStartWith("fp:h1:");
    expect(a.externalId).toMatch(/^fp:h1:[0-9a-f]{64}$/);
    expect(a.externalId).toBe(b.externalId);
    expect(a.externalId).not.toBe(c.externalId);
  });

  it("changes the payload hash when the amount changes", () => {
    expect(payloadHash(row())).toBe(payloadHash(row()));
    expect(payloadHash(row())).not.toBe(payloadHash(row({ amountPaise: 5 })));
  });

  it("keys hashes so a stored hash is not the plain SHA-256 of the row", () => {
    const hash = payloadHash(row({ idNumber: "ABCDE1234F", idType: "pan" }));
    expect(hash).toMatch(/^h1:[0-9a-f]{64}$/);
    expect(hash).not.toContain("ABCDE1234F");
  });

  it("ignores the batch default channel but not a channel the file states", () => {
    expect(payloadHash(row({ channel: "upi" }))).toBe(
      payloadHash(row({ channel: "neft" }))
    );
    expect(
      payloadHash(row({ channel: "upi", channelFromFile: true }))
    ).not.toBe(payloadHash(row({ channel: "neft", channelFromFile: true })));
  });
});

describe("classifyRows", () => {
  it("sorts rows into ready, new donor, errors, already imported and conflicts", () => {
    const existing = row({
      externalId: "E1",
      idNumber: "ABCDE1234F",
      idType: "pan",
    });
    const ready = input(existing);
    const fresh = input(row({ donorName: "New Person", externalId: "E2" }));
    const broken = input(row({ externalId: "E3" }), {
      identityKey: null,
      normalized: {
        errors: [{ field: "amount", message: "Amount is missing" }],
        row: row(),
        warnings: [],
      },
      payloadHash: null,
    });
    const seen = input(row({ externalId: "E4" }));
    const changed = input(row({ externalId: "E5" }));
    const context = emptyContext();
    context.idMatches = new Map([
      [idMatchKey("pan", "ABCDE1234F"), [{ name: "Asha Rao", partyId: "p-1" }]],
    ]);
    context.identities = new Map([
      [
        seen.identityKey ?? "",
        { contributionId: "c-4", payloadHash: seen.payloadHash ?? "" },
      ],
      [
        changed.identityKey ?? "",
        { contributionId: "c-5", payloadHash: "other" },
      ],
    ]);
    const result = classifyRows([ready, fresh, broken, seen, changed], context);
    expect(result.map((r) => r.category)).toEqual([
      "ready",
      "new_donor",
      "error",
      "already_imported",
      "conflict",
    ]);
    expect(result[0]?.donor).toEqual({
      kind: "existing",
      name: "Asha Rao",
      partyId: "p-1",
    });
    expect(result[3]?.linkTo).toEqual({ contributionId: "c-4" });
  });

  it("marks an identical repeat inside the file and flags a changed one", () => {
    const first = input(row({ externalId: "X" }));
    const same = input(row({ externalId: "X" }));
    const different = input(row({ amountPaise: 1, externalId: "X" }));
    const result = classifyRows([first, same, different], emptyContext());
    expect(result.map((r) => r.category)).toEqual([
      "new_donor",
      "repeated_in_file",
      "conflict",
    ]);
    expect(result[1]?.linkTo).toEqual({ rowId: first.id });
    expect(result[1]?.repeatOf).toEqual({
      rowId: first.id,
      rowNumber: first.rowNumber,
    });
    // The repeat still links to the earlier row's contribution.
    expect(planRows(result, {}).get(same.id)).toEqual({
      action: "link",
      to: { rowId: first.id },
    });
  });

  it("calls a row from an earlier upload already imported, not repeated", () => {
    const seen = input(row({ externalId: "U" }));
    const again = input(row({ externalId: "U" }));
    const context = emptyContext();
    context.identities = new Map([
      [
        seen.identityKey ?? "",
        { contributionId: "c-u", payloadHash: seen.payloadHash ?? "" },
      ],
    ]);
    const result = classifyRows([seen, again], context);
    expect(result.map((r) => r.category)).toEqual([
      "already_imported",
      "already_imported",
    ]);
    expect(result.map((r) => r.repeatOf)).toEqual([null, null]);
  });

  it("only proposes donors matched by email or phone, never picks them", () => {
    const byEmail = input(row({ email: "a@x.in", externalId: "M1" }));
    const context = emptyContext();
    context.emailMatches = new Map([
      ["a@x.in", [{ name: "Asha (existing)", partyId: "p-9" }]],
    ]);
    const [result] = classifyRows([byEmail], context);
    expect(result?.category).toBe("needs_review");
    expect(result?.donor).toEqual({ kind: "undecided" });
    expect(result?.donorOptions).toEqual([
      {
        kind: "existing",
        name: "Asha (existing)",
        partyId: "p-9",
        reason: "email",
      },
    ]);
  });

  it("never picks between two donors sharing an identifier", () => {
    const context = emptyContext();
    context.idMatches = new Map([
      [
        idMatchKey("pan", "ABCDE1234F"),
        [
          { name: "One", partyId: "p-1" },
          { name: "Two", partyId: "p-2" },
        ],
      ],
    ]);
    const [result] = classifyRows(
      [input(row({ externalId: "D", idNumber: "ABCDE1234F", idType: "pan" }))],
      context
    );
    expect(result?.category).toBe("needs_review");
    expect(
      result?.donorOptions.map((o) => o.kind === "existing" && o.partyId)
    ).toEqual(["p-1", "p-2"]);
  });

  it("groups new donors by identifier and proposes same-contact rows", () => {
    const a = input(
      row({
        email: "z@x.in",
        externalId: "G1",
        idNumber: "ABCDE1234F",
        idType: "pan",
      })
    );
    const b = input(
      row({ externalId: "G2", idNumber: "ABCDE1234F", idType: "pan" })
    );
    const c = input(row({ email: "z@x.in", externalId: "G3" }));
    const result = classifyRows([a, b, c], emptyContext());
    expect(result[0]?.donor).toEqual({ key: "id:pan:ABCDE1234F", kind: "new" });
    expect(result[1]?.donor).toEqual({ key: "id:pan:ABCDE1234F", kind: "new" });
    expect(result[2]?.category).toBe("needs_review");
    expect(result[2]?.donorOptions).toEqual([
      { kind: "row", reason: "email", rowId: a.id, rowNumber: a.rowNumber },
    ]);
  });

  it("makes a later row with the same ID number follow an undecided first row", () => {
    const context = emptyContext();
    context.emailMatches = new Map([
      ["d@x.in", [{ name: "Dev", partyId: "p-d" }]],
    ]);
    const a = input(
      row({
        email: "d@x.in",
        externalId: "S1",
        idNumber: "ABCDE1234F",
        idType: "pan",
      })
    );
    const b = input(
      row({ externalId: "S2", idNumber: "ABCDE1234F", idType: "pan" })
    );
    const [first, second] = classifyRows([a, b], context);
    expect(first?.category).toBe("needs_review");
    expect(second?.category).toBe("needs_review");
    expect(second?.donorOptions).toEqual([]);
    expect(second?.sameDonorAs).toEqual({
      rowId: a.id,
      rowNumber: a.rowNumber,
    });
  });

  it("proposes a possible duplicate by reference or by donor, day and amount", () => {
    const context = emptyContext();
    context.idMatches = new Map([
      [idMatchKey("pan", "ABCDE1234F"), [{ name: "Asha", partyId: "p-1" }]],
    ]);
    context.existingContributions = [
      {
        amountPaise: 100_000,
        id: "c-1",
        partyId: "p-1",
        receivedOn: "2026-10-01",
        reference: null,
      },
      {
        amountPaise: 5,
        id: "c-2",
        partyId: "p-7",
        receivedOn: "2026-01-01",
        reference: "UTR9",
      },
    ];
    const [sameDay, sameRef] = classifyRows(
      [
        input(row({ externalId: "S1", idNumber: "ABCDE1234F", idType: "pan" })),
        input(row({ donorName: "Other", externalId: "S2", reference: "utr9" })),
      ],
      context
    );
    expect(sameDay?.category).toBe("needs_review");
    expect(sameDay?.duplicate?.reason).toBe("same_day_amount");
    expect(sameRef?.duplicate?.reason).toBe("reference");
  });

  it("keeps finished rows out of the work", () => {
    const done = input(row({ externalId: "F" }), { outcome: "imported" });
    const [result] = classifyRows([done], emptyContext());
    expect(result?.category).toBe("done");
  });
});

describe("planRows", () => {
  it("skips undecided review rows and applies choices", () => {
    const context = emptyContext();
    context.emailMatches = new Map([
      ["a@x.in", [{ name: "A", partyId: "p-1" }]],
    ]);
    const rows = [
      input(row({ email: "a@x.in", externalId: "P1" })),
      input(row({ email: "a@x.in", externalId: "P2" })),
      input(row({ email: "a@x.in", externalId: "P3" })),
      input(row({ donorName: "Brand New", externalId: "P4" })),
    ];
    const classified = classifyRows(rows, context);
    const plans = planRows(classified, {
      [rows[1]?.id ?? ""]: { donor: "party:p-1" },
      [rows[2]?.id ?? ""]: { donor: "new" },
    });
    expect(plans.get(rows[0]?.id ?? "")).toEqual({
      action: "skip",
      reason: "undecided",
    });
    expect(plans.get(rows[1]?.id ?? "")).toEqual({
      action: "import",
      donor: { kind: "existing", partyId: "p-1" },
      fill: true,
    });
    expect(plans.get(rows[2]?.id ?? "")).toEqual({
      action: "import",
      donor: { key: `row:${rows[2]?.id}`, kind: "new" },
      fill: false,
    });
    expect(summarizePlans(plans.values())).toEqual({
      conflicts: 0,
      errors: 0,
      imports: 3,
      links: 0,
      newDonors: 2,
      skips: 1,
    });
  });

  it("refuses a donor choice that was not offered", () => {
    const context = emptyContext();
    context.emailMatches = new Map([
      ["a@x.in", [{ name: "A", partyId: "p-1" }]],
    ]);
    const rows = [input(row({ email: "a@x.in", externalId: "Q1" }))];
    const plans = planRows(classifyRows(rows, context), {
      [rows[0]?.id ?? ""]: { donor: "party:someone-else" },
    });
    expect(plans.get(rows[0]?.id ?? "")).toEqual({
      action: "skip",
      reason: "undecided",
    });
  });

  it("joins a row to an earlier row's new donor", () => {
    const a = input(row({ email: "z@x.in", externalId: "J1" }));
    const b = input(row({ email: "z@x.in", externalId: "J2" }));
    const plans = planRows(classifyRows([a, b], emptyContext()), {
      [b.id]: { donor: `row:${a.id}` },
    });
    expect(plans.get(b.id)).toEqual({
      action: "import",
      donor: { key: `row:${a.id}`, kind: "new" },
      fill: false,
    });
    expect(summarizePlans(plans.values()).newDonors).toBe(1);
  });

  describe("one ID number, one donor", () => {
    // A: PAN X and an email that matches existing donor D, so it needs review.
    // B: the same PAN X and no contact details.
    const setup = () => {
      const context = emptyContext();
      context.emailMatches = new Map([
        ["d@x.in", [{ name: "Dev", partyId: "p-d" }]],
      ]);
      const a = input(
        row({
          email: "d@x.in",
          externalId: "P1",
          idNumber: "ABCDE1234F",
          idType: "pan",
        })
      );
      const b = input(
        row({
          amountPaise: 2500,
          externalId: "P2",
          idNumber: "ABCDE1234F",
          idType: "pan",
        })
      );
      return { a, b, classified: classifyRows([a, b], context) };
    };

    it("creates exactly one new donor when the reviewer picks New donor", () => {
      const { a, b, classified } = setup();
      const plans = planRows(classified, { [a.id]: { donor: "new" } });
      expect(plans.get(a.id)).toEqual({
        action: "import",
        donor: { key: `row:${a.id}`, kind: "new" },
        fill: false,
      });
      expect(plans.get(b.id)).toEqual(plans.get(a.id));
      expect(summarizePlans(plans.values())).toMatchObject({
        imports: 2,
        newDonors: 1,
      });
    });

    it("links both rows to the existing donor the reviewer picks", () => {
      const { a, b, classified } = setup();
      const plans = planRows(classified, { [a.id]: { donor: "party:p-d" } });
      const toD = {
        action: "import",
        donor: { kind: "existing", partyId: "p-d" },
      } as const;
      // Only the row where the email match was accepted fills details.
      expect(plans.get(a.id)).toEqual({ ...toD, fill: true });
      expect(plans.get(b.id)).toEqual({ ...toD, fill: false });
      expect(summarizePlans(plans.values()).newDonors).toBe(0);
    });

    it("keeps the second row back until the first row's donor is chosen", () => {
      const { a, b, classified } = setup();
      const plans = planRows(classified, { [b.id]: { donor: "new" } });
      expect(plans.get(a.id)).toEqual({ action: "skip", reason: "undecided" });
      expect(plans.get(b.id)).toEqual({ action: "skip", reason: "undecided" });
    });

    it("still follows the first row's donor when that row is skipped", () => {
      const { a, b, classified } = setup();
      const plans = planRows(classified, {
        [a.id]: { contribution: "skip", donor: "party:p-d" },
      });
      expect(plans.get(b.id)).toEqual({
        action: "import",
        donor: { kind: "existing", partyId: "p-d" },
        fill: false,
      });
    });
  });

  it("needs an explicit import for a possible duplicate", () => {
    const context = emptyContext();
    context.existingContributions = [
      {
        amountPaise: 9,
        id: "c",
        partyId: "p",
        receivedOn: "2026-01-01",
        reference: "R1",
      },
    ];
    const r = input(row({ externalId: "K", reference: "R1" }));
    const classified = classifyRows([r], context);
    expect(planRows(classified, {}).get(r.id)).toEqual({
      action: "skip",
      reason: "undecided",
    });
    expect(
      planRows(classified, { [r.id]: { contribution: "import" } }).get(r.id)
        ?.action
    ).toBe("import");
  });
});

describe("name proposals", () => {
  it("proposes an existing donor with the same name and never picks it", () => {
    const context = emptyContext();
    context.nameMatches = new Map([
      ["goodera", [{ name: "Goodera", partyId: "p-g" }]],
    ]);
    const r = input(row({ donorName: "  GOODERA ", externalId: "N1" }));
    const [result] = classifyRows([r], context);
    expect(result?.category).toBe("needs_review");
    expect(result?.donor).toEqual({ kind: "undecided" });
    expect(result?.donorOptions).toEqual([
      { kind: "existing", name: "Goodera", partyId: "p-g", reason: "name" },
    ]);
    expect(planRows([result!], {}).get(r.id)).toEqual({
      action: "skip",
      reason: "undecided",
    });
    expect(
      planRows([result!], { [r.id]: { donor: "party:p-g" } }).get(r.id)
    ).toEqual({
      action: "import",
      donor: { kind: "existing", partyId: "p-g" },
      fill: true,
    });
  });

  it("proposes an earlier row with the same name, and choosing it makes one new donor", () => {
    const a = input(row({ donorName: "Nextgen", externalId: "N2" }));
    const b = input(row({ donorName: "nextgen", externalId: "N3" }));
    const classified = classifyRows([a, b], emptyContext());
    expect(classified[0]?.category).toBe("new_donor");
    expect(classified[1]?.category).toBe("needs_review");
    expect(classified[1]?.donorOptions).toEqual([
      { kind: "row", reason: "name", rowId: a.id, rowNumber: a.rowNumber },
    ]);
    const joined = planRows(classified, { [b.id]: { donor: `row:${a.id}` } });
    expect(joined.get(b.id)).toEqual({
      action: "import",
      donor: { key: `row:${a.id}`, kind: "new" },
      fill: false,
    });
    expect(summarizePlans(joined.values()).newDonors).toBe(1);
    const apart = planRows(classified, { [b.id]: { donor: "new" } });
    expect(summarizePlans(apart.values()).newDonors).toBe(2);
  });

  it("does not offer a row whose different ID number makes it another donor", () => {
    const a = input(
      row({ externalId: "N4", idNumber: "ABCDE1234F", idType: "pan" })
    );
    const b = input(
      row({ externalId: "N5", idNumber: "ABCDE5678G", idType: "pan" })
    );
    const classified = classifyRows([a, b], emptyContext());
    expect(classified[1]?.category).toBe("new_donor");
    expect(classified[1]?.donorOptions).toEqual([]);
  });
});

describe("summarizeReview", () => {
  const view = (overrides: Partial<ReviewRowView>): ReviewRowView => ({
    amountPaise: 100,
    category: "ready",
    donor: { kind: "undecided" },
    donorName: "A",
    donorOptions: [],
    duplicate: null,
    email: null,
    errors: [],
    maskedId: null,
    outcome: "pending",
    outcomeReason: null,
    rawAvailable: true,
    receivedOn: "2026-10-01",
    reference: null,
    repeatOf: null,
    rowId: crypto.randomUUID(),
    rowNumber: 1,
    sameDonorAs: null,
    warnings: [],
    ...overrides,
  });

  it("counts imports, new donors and skips as the confirmation shows them", () => {
    const review = view({
      category: "needs_review",
      donorOptions: [
        { fills: [], label: "A", reason: "email", value: "party:p" },
      ],
    });
    const creator = view({
      category: "new_donor",
      donor: { createdOnRow: null, kind: "new" },
    });
    const rows = [
      view({
        category: "ready",
        donor: { kind: "existing", name: "P", partyId: "p" },
      }),
      creator,
      view({
        category: "new_donor",
        donor: {
          createdOnRow: { rowId: creator.rowId, rowNumber: 2 },
          kind: "new",
        },
      }),
      view({ category: "error" }),
      view({ category: "already_imported" }),
      view({ category: "repeated_in_file", repeatOf: { rowNumber: 2 } }),
      view({ category: "conflict" }),
      view({ category: "done" }),
      review,
    ];
    expect(summarizeReview(rows, {})).toEqual({
      conflicts: 1,
      errors: 1,
      existingDonors: 1,
      fills: 0,
      imports: 3,
      links: 1,
      newDonors: 1,
      repeats: 1,
      skips: 1,
      undecided: 1,
    });
    expect(
      summarizeReview(rows, { [review.rowId]: { donor: "new" } })
    ).toMatchObject({
      existingDonors: 1,
      imports: 4,
      newDonors: 2,
      skips: 0,
      undecided: 0,
    });
    // Choosing the donor already on record adds no donor.
    expect(
      summarizeReview(rows, { [review.rowId]: { donor: "party:p" } })
    ).toMatchObject({ existingDonors: 1, imports: 4, newDonors: 1 });
  });

  it("counts a row pointed at an earlier row's new donor once, even if that row is skipped", () => {
    const creator = view({
      category: "new_donor",
      donor: { createdOnRow: null, kind: "new" },
    });
    const joiner = view({
      category: "needs_review",
      donorOptions: [
        {
          fills: [],
          label: "New donor from row 1",
          reason: "email",
          value: `row:${creator.rowId}`,
        },
      ],
    });
    const choice = { donor: `row:${creator.rowId}` };
    expect(
      summarizeReview([creator, joiner], { [joiner.rowId]: choice })
    ).toMatchObject({ imports: 2, newDonors: 1 });
    expect(
      summarizeReview([creator, joiner], {
        [creator.rowId]: { contribution: "skip" },
        [joiner.rowId]: choice,
      })
    ).toMatchObject({ imports: 1, newDonors: 1, skips: 1 });
  });

  it("counts a new donor chosen on one row and followed by a same-ID row once", () => {
    const first = view({
      category: "needs_review",
      donorOptions: [
        { fills: [], label: "D", reason: "email", value: "party:p" },
      ],
    });
    const follower = view({
      category: "needs_review",
      sameDonorAs: { rowId: first.rowId, rowNumber: first.rowNumber },
    });
    expect(summarizeReview([first, follower], {})).toMatchObject({
      imports: 0,
      undecided: 2,
    });
    expect(
      summarizeReview([first, follower], { [first.rowId]: { donor: "new" } })
    ).toMatchObject({ imports: 2, newDonors: 1, undecided: 0 });
  });
});

describe("review wording", () => {
  it("labels a row's badge in the singular and names the repeat", () => {
    expect(REVIEW_ROW_STATUS_LABELS.new_donor).toBe("New donor");
    expect(REVIEW_CATEGORY_LABELS.new_donor).toBe("New donor");
    expect(REVIEW_ROW_STATUS_LABELS.repeated_in_file).toBe("Repeated in file");
    expect(REVIEW_CATEGORY_LABELS.repeated_in_file).toBe("Repeated in file");
    expect(REVIEW_CATEGORY_LABELS.already_imported).toBe("Already imported");
  });

  it("writes the summary line without zero parts", () => {
    const empty = {
      conflicts: 0,
      errors: 0,
      existingDonors: 0,
      fills: 0,
      imports: 0,
      links: 0,
      newDonors: 0,
      repeats: 0,
      skips: 0,
      undecided: 0,
    };
    expect(reviewSummaryLine(empty)).toBe("");
    expect(
      reviewSummaryLine({
        ...empty,
        errors: 1,
        imports: 3,
        newDonors: 2,
        repeats: 1,
      })
    ).toBe("3 gifts to import · 2 new donors · 1 repeated in file · 1 error");
    expect(
      reviewSummaryLine({
        ...empty,
        conflicts: 2,
        existingDonors: 1,
        imports: 1,
        links: 4,
        undecided: 2,
      })
    ).toBe(
      "1 gift to import · 1 existing donor · 2 need review · 4 already imported · 2 conflicts"
    );
  });
});
