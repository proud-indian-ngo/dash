import { describe, expect, it } from "bun:test";

import { strToU8, zipSync } from "fflate";

import {
  extractPdfText,
  type MatchRow,
  matchCertificates,
  readCertificateFields,
  unpackCertificateUpload,
} from "./certificate-parser";
import {
  type SyntheticCertificate,
  syntheticCertificatePdf,
} from "./synthetic-certificate.test-helper";

const row = (overrides: Partial<MatchRow>): MatchRow => ({
  amountPaise: 250_000,
  certificate: null,
  donationTypeCode: "Specific grant",
  id: "r1",
  idNumber: "AAAPE1234E",
  modeCode: "Electronic modes including account payee cheque/draft",
  preArn: "PI2627F01R00001",
  ...overrides,
});

const ROWS: MatchRow[] = [
  row({}),
  row({
    amountPaise: 100_000,
    id: "r2",
    idNumber: "BBBPE5678F",
    preArn: "PI2627F01R00002",
  }),
  // The second donor again, by cash, for the same amount.
  row({
    amountPaise: 100_000,
    id: "r3",
    idNumber: "BBBPE5678F",
    modeCode: "Cash",
    preArn: "PI2627F01R00003",
  }),
];

const certificate = (
  overrides: Partial<SyntheticCertificate> = {}
): SyntheticCertificate => ({
  acknowledgementNumber: "114000000000001",
  amount: "2,500.00",
  donationType: "Specific grant",
  donorName: "Asha (Test) Rao",
  idNumber: "AAAPE1234E",
  mode: "Electronic modes including account payee cheque/draft",
  preArn: "PI2627F01R00001",
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
  filingAck: string | null = "113000000000009"
) {
  const files = await Promise.all(
    values.map(async (value, index) => ({
      fields: await fieldsOf(value),
      name: `${index}.pdf`,
      sha256: `sha-${index}`,
    }))
  );
  return matchCertificates(files, rows, filingAck);
}

describe("reading a certificate", () => {
  it("finds the acknowledgement number, Pre-ARN, ID and amount in the PDF text", async () => {
    const fields = await fieldsOf(certificate());
    expect(fields.acknowledgementNumbers).toEqual(["114000000000001"]);
    expect(fields.preArns).toEqual(["PI2627F01R00001"]);
    expect(fields.compact).toContain("AAAPE1234E");
    expect(fields.text).toContain("2,500.00");
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
  it("matches by Pre-ARN and keeps the certificate's own number", async () => {
    expect(await decide([certificate()])).toEqual([
      {
        acknowledgementNumber: "114000000000001",
        kind: "matched",
        matchedBy: "pre_arn",
        rowId: "r1",
      },
    ]);
  });

  it("takes the Pre-ARN as the number when the certificate reuses it unlabelled", async () => {
    const fields = await fieldsOf(certificate());
    fields.acknowledgementNumbers = [];
    expect(
      matchCertificates([{ fields, name: "a.pdf", sha256: "x" }], ROWS, null)
    ).toEqual([
      {
        acknowledgementNumber: "PI2627F01R00001",
        kind: "matched",
        matchedBy: "pre_arn",
        rowId: "r1",
      },
    ]);
  });

  it("falls back to the donor's ID and amount without a Pre-ARN", async () => {
    expect(await decide([certificate({ preArn: undefined })])).toEqual([
      {
        acknowledgementNumber: "114000000000001",
        kind: "matched",
        matchedBy: "details",
        rowId: "r1",
      },
    ]);
  });

  it("breaks a tie between a donor's rows by donation type and mode", async () => {
    expect(
      await decide([
        certificate({
          amount: "1000",
          idNumber: "BBBPE5678F",
          mode: "Cash",
          preArn: undefined,
        }),
      ])
    ).toEqual([
      {
        acknowledgementNumber: "114000000000001",
        kind: "matched",
        matchedBy: "details",
        rowId: "r3",
      },
    ]);
  });

  it("leaves unmatched what fits no row, several rows or another filing", async () => {
    const decisions = await decide([
      // Wrong amount for the donor.
      certificate({ amount: "2,400.00", preArn: undefined }),
      // Same donor and amount on two rows, mode not printed apart.
      certificate({
        amount: "1,000.00",
        idNumber: "BBBPE5678F",
        mode: "Others",
        preArn: undefined,
      }),
      // A Pre-ARN from filing 2.
      certificate({ preArn: "PI2627F02R00001" }),
    ]);
    expect(decisions).toEqual([
      { kind: "unmatched", reason: "no_row" },
      { kind: "unmatched", reason: "several_rows" },
      { kind: "unmatched", reason: "other_filing" },
    ]);
  });

  it("needs a number of its own when matched by details", async () => {
    const fields = await fieldsOf(certificate({ preArn: undefined }));
    fields.acknowledgementNumbers = ["113000000000009"];
    expect(
      matchCertificates(
        [{ fields, name: "a.pdf", sha256: "x" }],
        ROWS,
        "113000000000009"
      )
    ).toEqual([{ kind: "unmatched", reason: "no_acknowledgement" }]);
  });

  it("takes one certificate per row and never stores a number twice", async () => {
    const decisions = await decide([
      certificate(),
      certificate({ acknowledgementNumber: "114000000000002" }),
      certificate({
        amount: "1,000.00",
        idNumber: "BBBPE5678F",
        preArn: "PI2627F01R00002",
      }),
    ]);
    expect(decisions.map((decision) => decision.kind)).toEqual([
      "matched",
      "unmatched",
      "unmatched",
    ]);
    expect(decisions[1]).toEqual({
      kind: "unmatched",
      reason: "duplicate_in_upload",
    });
    expect(decisions[2]).toEqual({
      kind: "unmatched",
      reason: "acknowledgement_in_use",
    });
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

  it("reports a file whose text couldn't be read", () => {
    expect(
      matchCertificates(
        [{ fields: null, name: "x.pdf", sha256: "x" }],
        ROWS,
        null
      )
    ).toEqual([{ kind: "unmatched", reason: "unreadable" }]);
  });
});
