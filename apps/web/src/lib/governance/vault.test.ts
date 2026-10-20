import { describe, expect, it, mock } from "bun:test";

import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";

import {
  importVaultDocument,
  safeFileName,
  sniffType,
  type VaultImportDeps,
  type VaultImportInput,
} from "./vault";

const encoder = new TextEncoder();
const PDF = encoder.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const EML = encoder.encode(
  "Received: by mx\r\nFrom: a@example.com\r\nDate: Fri, 16 Oct 2026 10:00:00 +0530\r\nSubject: Resignation\r\n\r\nBody"
);

const signedReport: GovernanceValidationReport = {
  checkedAt: "2026-10-18T00:00:00Z",
  signatures: [
    {
      coversWholeRevision: true,
      fieldName: "Signature1",
      intact: true,
      issuer: "Capricorn CA",
      matchedTrusteeId: null,
      modificationLevel: "NONE",
      notAfter: null,
      notBefore: null,
      serial: "AB",
      sha256Fingerprint: "f".repeat(64),
      signerName: "CHENTHIL KUMAR S",
      signingTime: "2026-04-04T10:00:00Z",
      subject: "CN=CHENTHIL KUMAR S",
      timestamped: false,
      trusted: true,
    },
  ],
  status: "valid",
};

function input(overrides: Partial<VaultImportInput> = {}): VaultImportInput {
  return {
    datedOn: "2026-04-04",
    fileName: "Resignation letter.pdf",
    keyPrefix: "dev",
    kind: "resignation",
    note: null,
    sourceFormat: "pdf",
    tempKey: "dev/governance/tmp/user-1/0193-Resignation-letter.pdf",
    title: "Chenthil's resignation",
    userId: "user-1",
    ...overrides,
  };
}

function deps(
  bytes: Uint8Array | null,
  report: GovernanceValidationReport = {
    checkedAt: "x",
    signatures: [],
    status: "no_signatures",
  }
) {
  const written = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const inserted: Parameters<VaultImportDeps["insert"]>[0][] = [];
  const d: VaultImportDeps = {
    deleteObject: mock(async (key: string) => {
      deleted.push(key);
    }),
    findBySha256: mock(async () => null),
    insert: mock(async (row) => {
      inserted.push(row);
      return row.id;
    }),
    readObject: mock(async () => bytes),
    trusteeNames: mock(async () => [
      { id: "chenthil", names: ["Chenthil Kumar S"] },
    ]),
    validatePdf: mock(async () => structuredClone(report)),
    writeObject: mock(async (key: string, b: Uint8Array) => {
      written.set(key, b);
    }),
  };
  return { d, deleted, inserted, written };
}

describe("sniffType", () => {
  it("tells files apart by their first bytes", () => {
    expect(sniffType(PDF)).toBe("pdf");
    expect(sniffType(EML)).toBe("eml");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffType(encoder.encode("hello world"))).toBeNull();
  });
});

describe("importVaultDocument", () => {
  it("stores a PDF under its permanent key with its hash and deletes the upload", async () => {
    const { d, deleted, inserted, written } = deps(PDF);
    const result = await importVaultDocument(input(), d);
    expect(result.sourceFormat).toBe("pdf");
    const [row] = inserted;
    expect(row?.objectKey).toBe(
      `dev/governance/documents/${result.id}/Resignation-letter.pdf`
    );
    expect(row?.sha256).toHaveLength(64);
    expect(row?.contentType).toBe("application/pdf");
    expect(written.has(row?.objectKey ?? "")).toBe(true);
    expect(deleted).toEqual([input().tempKey]);
  });

  it("records a PDF with signatures as signed and matches the signer", async () => {
    const { d, inserted } = deps(PDF, signedReport);
    const result = await importVaultDocument(input(), d);
    expect(result.sourceFormat).toBe("signed_pdf");
    expect(inserted[0]?.validationReport?.signatures[0]?.matchedTrusteeId).toBe(
      "chenthil"
    );
  });

  it("refuses a 'signed PDF' with no signatures", async () => {
    const { d, inserted } = deps(PDF);
    await expect(
      importVaultDocument(input({ sourceFormat: "signed_pdf" }), d)
    ).rejects.toThrow("no digital signatures");
    expect(inserted).toEqual([]);
  });

  it("keeps an email's headers as the report", async () => {
    const { d, inserted } = deps(EML);
    await importVaultDocument(
      input({ fileName: "resignation.eml", sourceFormat: "eml" }),
      d
    );
    expect(inserted[0]?.validationReport?.email?.from).toBe("a@example.com");
    expect(inserted[0]?.contentType).toBe("message/rfc822");
    expect(d.validatePdf).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't what it claims to be", async () => {
    const { d } = deps(EML);
    await expect(importVaultDocument(input(), d)).rejects.toThrow(
      "isn't a PDF"
    );
  });

  it("refuses a duplicate", async () => {
    const { d } = deps(PDF);
    d.findBySha256 = mock(async () => ({ id: "x", title: "The deed" }));
    await expect(importVaultDocument(input(), d)).rejects.toThrow(
      'already in the vault as "The deed"'
    );
  });

  it("refuses a duplicate recorded while it was being checked", async () => {
    const { d, deleted } = deps(PDF);
    let lookups = 0;
    d.findBySha256 = mock(async () => {
      lookups += 1;
      return lookups === 1 ? null : { id: "x", title: "The deed" };
    });
    d.insert = mock(async () => {
      throw new Error("Failed query", {
        cause: { code: "23505", constraint: "governance_document_sha256_uidx" },
      });
    });
    await expect(importVaultDocument(input(), d)).rejects.toThrow(
      'already in the vault as "The deed"'
    );
    expect(deleted.some((key) => key.includes("/documents/"))).toBe(true);
  });

  it("refuses another user's upload or another folder", async () => {
    const { d } = deps(PDF);
    await expect(
      importVaultDocument(
        input({ tempKey: "dev/governance/tmp/user-2/0193-x.pdf" }),
        d
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      importVaultDocument(
        input({ tempKey: "dev/attachments/tmp/user-1/0193-x.pdf" }),
        d
      )
    ).rejects.toThrow("Forbidden");
  });

  it("removes the copy when the row can't be recorded", async () => {
    const { d, deleted } = deps(PDF);
    d.insert = mock(async () => {
      throw new Error("db down");
    });
    await expect(importVaultDocument(input(), d)).rejects.toThrow("db down");
    expect(deleted[0]).toContain("/governance/documents/");
  });
});

describe("safeFileName", () => {
  it("keeps names usable in keys and headers", () => {
    expect(safeFileName('Deed "v2"/final.pdf')).toBe("Deed-v2final.pdf");
    expect(safeFileName("  ")).toBe("document");
  });
});
