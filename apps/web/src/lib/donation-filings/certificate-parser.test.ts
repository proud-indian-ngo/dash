import { describe, expect, it } from "bun:test";

import { strToU8, zipSync } from "fflate";

import {
  assessAssignedCertificate,
  extractPdfText,
  type FilingContext,
  type MatchRow,
  matchCertificates,
  readCertificateFields,
  unpackCertificateUpload,
} from "./certificate-parser";
import {
  type SyntheticCertificate,
  syntheticCertificatePdf,
} from "./synthetic-certificate.test-helper";

const ELECTRONIC = "Electronic modes including account payee cheque/draft";

const row = (overrides: Partial<MatchRow>): MatchRow => ({
  amountPaise: 250_000,
  certificate: null,
  donationTypeCode: "Specific grant",
  id: "r1",
  idNumber: "AAAPE1234E",
  modeCode: ELECTRONIC,
  name: "Asha Rao",
  ...overrides,
});

const ROWS: MatchRow[] = [
  row({}),
  row({
    amountPaise: 100_000,
    id: "r2",
    idNumber: "BBBPE5678F",
    name: "Bina Shah",
  }),
  // The second donor again, by cash, for the same amount.
  row({
    amountPaise: 100_000,
    id: "r3",
    idNumber: "BBBPE5678F",
    modeCode: "Cash",
    name: "Bina Shah",
  }),
];

const filing = (overrides: Partial<FilingContext> = {}): FilingContext => ({
  acknowledgementNumber: "113000000000009",
  fiscalYear: "2026-27",
  otherAcknowledgementNumbers: new Set(),
  ...overrides,
});

const certificate = (
  overrides: Partial<SyntheticCertificate> = {}
): SyntheticCertificate => ({
  acknowledgementNumber: "114000000000001",
  amount: "2,500.00",
  donationType: "Specific grant",
  donorName: "Asha Rao",
  idNumber: "AAAPE1234E",
  mode: ELECTRONIC,
  ...overrides,
});

async function fieldsOf(value: SyntheticCertificate) {
  return readCertificateFields(
    await extractPdfText(syntheticCertificatePdf(value))
  );
}

async function decide(
  values: SyntheticCertificate[],
  rows: MatchRow[] = ROWS,
  context: FilingContext = filing()
) {
  const files = await Promise.all(
    values.map(async (value, index) => ({
      fields: await fieldsOf(value),
      name: `${index}.pdf`,
      sha256: `sha-${index}`,
    }))
  );
  return matchCertificates(files, rows, context);
}

describe("reading a certificate", () => {
  it("finds the labelled acknowledgement number, ID, amount, type and mode", async () => {
    const fields = await fieldsOf(certificate({ mode: "Cash" }));
    expect(fields.acknowledgementNumbers).toEqual(["114000000000001"]);
    expect(fields.idNumber).toBe("AAAPE1234E");
    expect(fields.amountPaise).toBe(250_000);
    expect(fields.donationType).toBe("Specific grant");
    expect(fields.mode).toBe("Cash");
    expect(fields.donorName).toBe("asha rao");
  });

  it("never takes prose after the label for an acknowledgement number", () => {
    const fields = readCertificateFields(
      "Acknowledgement Number generated for this certificate is shown below. Acknowledgement No. 114999000000123"
    );
    expect(fields.acknowledgementNumbers).toEqual(["114999000000123"]);
  });

  it("unpacks the PDFs of a ZIP and lists anything else", () => {
    const pdf = syntheticCertificatePdf(certificate());
    const zip = zipSync({
      "114/a.pdf": pdf,
      "114/readme.txt": strToU8("not a certificate"),
      "__MACOSX/114/._a.pdf": strToU8("junk"),
    });
    const unpacked = unpackCertificateUpload("certificates.zip", zip);
    expect(unpacked.files.map((file) => file.name)).toEqual(["114/a.pdf"]);
    expect(unpacked.skipped).toEqual([
      { name: "114/readme.txt", reason: "not_pdf" },
    ]);
    expect(unpackCertificateUpload("one.pdf", pdf).files).toHaveLength(1);
    expect(
      unpackCertificateUpload("notes.txt", strToU8("hello")).skipped
    ).toEqual([{ name: "notes.txt", reason: "not_pdf" }]);
  });
});

describe("matching certificates to filing rows", () => {
  it("proposes a details match (for review) from the ID, amount and name", async () => {
    expect(await decide([certificate()])).toEqual([
      {
        acknowledgementNumber: "114000000000001",
        kind: "matched",
        matchedBy: "details",
        needsReview: true,
        rowId: "r1",
      },
    ]);
  });

  it("never matches an ID inside another number, such as a PIN code (reviewer's case)", async () => {
    // The short ID 56003 used to match inside the PIN code 560034.
    const shortRow = row({
      amountPaise: 100_000,
      id: "short",
      idNumber: "56003",
      name: "Ravi Kumar",
    });
    const value = certificate({
      address: "4 Lake Road, Bengaluru, 560034",
      amount: "1,000.00",
      donorName: "Ravi Kumar",
      idLabel: false,
      idNumber: "ZZZPZ9999Z",
    });
    expect(await decide([value], [shortRow])).toEqual([
      { kind: "unmatched", reason: "no_row" },
    ]);
    // Even printed as its own token, an ID under eight characters is too
    // short for automatic matching.
    expect(await decide([{ ...value, idNumber: "56003" }], [shortRow])).toEqual(
      [{ kind: "unmatched", reason: "no_row" }]
    );
    // A long ID only inside a longer number doesn't match either.
    expect(
      await decide(
        [{ ...value, idNumber: "X12345678901" }],
        [{ ...shortRow, idNumber: "12345678" }]
      )
    ).toEqual([{ kind: "unmatched", reason: "no_row" }]);
  });

  it("needs the donor's name and the whole amount, not digits in a date", async () => {
    expect(await decide([certificate({ donorName: "Someone Else" })])).toEqual([
      { kind: "unmatched", reason: "no_row" },
    ]);
    // ₹2,026 against a certificate printing only "Tax year: 2026-27".
    const fields = readCertificateFields(
      "Name of the donor: Asha Rao Unique Identification Number of the donor: AAAPE1234E Tax year: 2026-27 Acknowledgement Number: 114000000000001"
    );
    expect(
      matchCertificates(
        [{ fields, name: "a.pdf", sha256: "x" }],
        [row({ amountPaise: 202_600 })],
        filing()
      )
    ).toEqual([{ kind: "unmatched", reason: "no_row" }]);
  });

  it("breaks a tie between a donor's rows by the labelled type and mode", async () => {
    expect(
      await decide([
        certificate({
          amount: "1,000.00",
          donorName: "Bina Shah",
          idNumber: "BBBPE5678F",
          mode: "Cash",
        }),
      ])
    ).toEqual([
      {
        acknowledgementNumber: "114000000000001",
        kind: "matched",
        matchedBy: "details",
        needsReview: true,
        rowId: "r3",
      },
    ]);
  });

  it("ignores 'cash' in boilerplate when breaking a tie", () => {
    const fields = readCertificateFields(
      "A donation in cash above Rs 2,000 is not deductible. Name of the donor: Bina Shah Unique Identification Number of the donor: BBBPE5678F Amount of donation: 1,000.00 Acknowledgement Number: 114000000000002"
    );
    expect(fields.mode).toBeNull();
    expect(
      matchCertificates(
        [{ fields, name: "a.pdf", sha256: "x" }],
        ROWS,
        filing({ acknowledgementNumber: null })
      )
    ).toEqual([{ kind: "unmatched", reason: "several_rows" }]);
  });

  it("needs a number of its own when matched by details", async () => {
    const fields = await fieldsOf(certificate());
    fields.acknowledgementNumbers = ["113000000000009"];
    expect(
      matchCertificates(
        [{ fields, name: "a.pdf", sha256: "x" }],
        ROWS,
        filing()
      )
    ).toEqual([{ kind: "unmatched", reason: "no_acknowledgement" }]);
  });

  it("takes one certificate per row and never stores a number twice", async () => {
    const decisions = await decide([
      certificate(),
      certificate({ acknowledgementNumber: "114000000000002" }),
      certificate({
        amount: "1,000.00",
        donorName: "Bina Shah",
        idNumber: "BBBPE5678F",
      }),
    ]);
    expect(decisions.map((decision) => decision.kind)).toEqual([
      "matched",
      "unmatched",
      "unmatched",
    ]);
    expect(decisions.slice(1)).toEqual([
      { kind: "unmatched", reason: "duplicate_in_upload" },
      { kind: "unmatched", reason: "acknowledgement_in_use" },
    ]);
  });

  it("recognises a re-uploaded certificate and refuses a different one for a row that has one", async () => {
    const stored = ROWS.map((value) =>
      value.id === "r1"
        ? {
            ...value,
            certificate: {
              acknowledgementNumber: "114000000000001",
              fileSha256: "sha-0",
            },
          }
        : value
    );
    expect(await decide([certificate()], stored)).toEqual([
      { kind: "already_stored", rowId: "r1" },
    ]);
    expect(
      await decide(
        [certificate({ acknowledgementNumber: "114000000000077" })],
        stored.map((value) =>
          value.certificate
            ? {
                ...value,
                certificate: { ...value.certificate, fileSha256: "other" },
              }
            : value
        )
      )
    ).toEqual([{ kind: "unmatched", reason: "row_has_certificate" }]);
  });

  it("refuses a different labelled ID and missing labels", async () => {
    for (const value of [
      certificate({ idNumber: "ZZZPZ9999Z" }),
      certificate({ idLabel: false }),
    ]) {
      expect(await decide([value])).toEqual([
        { kind: "unmatched", reason: "no_row" },
      ]);
    }
  });

  it("requires labelled amount and donor name, and a complete name match", async () => {
    for (const raw of [
      "Asha Rao Unique Identification Number: AAAPE1234E Amount: 2500.00 Acknowledgement Number: 114000000000001",
      "Name of the donor: Asha Rao Unique Identification Number: AAAPE1234E 2500.00 Acknowledgement Number: 114000000000001",
      "Name of the donor: Asha Rao Junior Unique Identification Number: AAAPE1234E Amount: 2500.00 Acknowledgement Number: 114000000000001",
    ]) {
      expect(
        matchCertificates(
          [{ fields: readCertificateFields(raw), name: "a.pdf", sha256: "x" }],
          ROWS,
          filing()
        )
      ).toEqual([{ kind: "unmatched", reason: "no_row" }]);
    }
  });

  it("requires a labelled certificate number even when an unlabelled number is printed", async () => {
    const raw = await extractPdfText(syntheticCertificatePdf(certificate()));
    const fields = readCertificateFields(
      raw.replace("Acknowledgement Number: ", "")
    );
    expect(
      matchCertificates(
        [{ fields, name: "a.pdf", sha256: "x" }],
        ROWS,
        filing()
      )
    ).toEqual([{ kind: "unmatched", reason: "no_acknowledgement" }]);
    expect(assessAssignedCertificate(fields, filing())).toEqual({
      reason: "no_acknowledgement",
    });
  });

  it("refuses a certificate of another filing or year", async () => {
    expect(
      await decide(
        [certificate()],
        ROWS,
        filing({ otherAcknowledgementNumbers: new Set(["114000000000001"]) })
      )
    ).toEqual([{ kind: "unmatched", reason: "acknowledgement_in_use" }]);
    expect(
      await decide([certificate()], ROWS, filing({ fiscalYear: "2027-28" }))
    ).toEqual([{ kind: "unmatched", reason: "other_year" }]);
  });

  it("lets finance assign a certificate by hand, still checked", async () => {
    const fields = await fieldsOf(certificate());
    expect(assessAssignedCertificate(fields, filing())).toEqual({
      acknowledgementNumber: "114000000000001",
    });
    expect(
      assessAssignedCertificate(fields, filing({ fiscalYear: "2025-26" }))
    ).toEqual({ reason: "other_year" });
    expect(
      assessAssignedCertificate(
        fields,
        filing({ otherAcknowledgementNumbers: new Set(["114000000000001"]) })
      )
    ).toEqual({ reason: "acknowledgement_in_use" });
    fields.acknowledgementNumbers = [];
    expect(assessAssignedCertificate(fields, filing())).toEqual({
      reason: "no_acknowledgement",
    });
  });

  it("reports a file whose text couldn't be read", () => {
    expect(
      matchCertificates(
        [{ fields: null, name: "x.pdf", sha256: "x" }],
        ROWS,
        filing()
      )
    ).toEqual([{ kind: "unmatched", reason: "unreadable" }]);
  });
});
