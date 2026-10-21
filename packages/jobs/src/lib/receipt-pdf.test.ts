import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

mock.module("@pi-dash/env/server", () => ({
  env: {
    APP_URL: "https://dash.example.org",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
    BETTER_AUTH_URL: "https://dash.example.org",
    R2_KEY_PREFIX: "app",
  },
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptDocument: mock(),
  recordStoredReceiptPdf: mock(),
}));

import type { ReceiptDocument } from "@pi-dash/db/queries/contribution-receipts";

const { receiptPdf } = await import("./receipt-pdf");

const RECEIPT_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const SIGNATURE_KEY = "app/attachments/receipt-signatures/signature.png";

// A 64×16 RGBA PNG header is all the signature check reads first.
function pngHeader(width = 64, height = 16): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 6;
  return header;
}

// Synthetic details only.
function document(overrides: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    donor: { address: "2 Test Lane", idType: null, name: "Test Donor" },
    donorIdNumber: null,
    gift: {
      amountPaise: 300_000,
      channel: "upi",
      donationType: "voluntary",
      donationTypeDescription: null,
      programmeName: null,
      projectName: null,
      receivedOn: "2026-05-01",
      reference: null,
    },
    issuedOn: "2026-05-04",
    number: "PI/2026-27/0001",
    org: { address: "1 Test Road", name: "Example Trust", pan: "AAATE0000E" },
    registration: {
      sectionCode: "Section 80G",
      urn: "TESTURN0000000",
      urnIssuedOn: "2025-01-01",
    },
    signatory: { designation: "Treasurer", name: "Test Signatory" },
    signatureKey: SIGNATURE_KEY,
    stored: null,
    version: 1,
    voidedAt: null,
    voidReason: null,
    with80G: false,
    ...overrides,
  };
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const SIGNED_KEY = `app/receipts/${RECEIPT_ID}/stored.pdf`;
const NEW_KEY = new RegExp(`^app/receipts/${RECEIPT_ID}/[0-9a-f-]{36}\\.pdf$`);

function harness(
  doc: ReceiptDocument | null,
  files: Record<string, Buffer>,
  winner?: { key: string; sha256: string }
) {
  const writes: { data: Buffer; key: string }[] = [];
  const deps = {
    file: (key: string) => ({
      arrayBuffer: async () => {
        const bytes = files[key];
        if (!bytes) {
          throw new Error(`No object ${key}`);
        }
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;
      },
      exists: async () => key in files,
      stat: async () => ({ size: files[key]?.byteLength ?? 0 }),
      write: async (data: Buffer) => {
        writes.push({ data, key });
        files[key] = data;
        return data.byteLength;
      },
    }),
    keyPrefix: "app",
    loadDocument: mock(async () => doc),
    recordStored: mock(
      async (_id: string, stored: { key: string; sha256: string }) =>
        winner ?? stored
    ),
    render: mock(async (props: { signatureImage: Buffer | null }) =>
      Buffer.from(`pdf:${props.signatureImage ? "signed" : "unsigned"}`)
    ),
  };
  return { deps, writes };
}

const signature = () => ({ [SIGNATURE_KEY]: pngHeader() });

describe("receiptPdf", () => {
  it("renders an unstored receipt with its signature and stores it under a random key", async () => {
    const { deps, writes } = harness(document(), signature());
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("pdf:signed");
    expect(result?.filename).toBe("PI-2026-27-0001.pdf");
    expect(writes).toHaveLength(1);
    const key = writes[0]?.key ?? "";
    // Random, never the hash the verify page shows.
    expect(key).toMatch(NEW_KEY);
    expect(key).not.toContain(sha("pdf:signed"));
    expect(deps.recordStored).toHaveBeenCalledWith(RECEIPT_ID, {
      key,
      sha256: sha("pdf:signed"),
    });
  });

  it("serves the winner's file when another store recorded first", async () => {
    const winnerKey = `app/receipts/${RECEIPT_ID}/${sha("other build")}.pdf`;
    const { deps } = harness(
      document(),
      { ...signature(), [winnerKey]: Buffer.from("other build") },
      { key: winnerKey, sha256: sha("other build") }
    );
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("other build");
  });

  it("serves a stored receipt as stored, without rendering", async () => {
    const { deps, writes } = harness(
      document({ stored: { key: SIGNED_KEY, sha256: sha("stored bytes") } }),
      { [SIGNED_KEY]: Buffer.from("stored bytes") }
    );
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("stored bytes");
    expect(deps.render).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("refuses a stored file that no longer matches its hash", async () => {
    const { deps } = harness(
      document({ stored: { key: SIGNED_KEY, sha256: sha("issued") } }),
      { [SIGNED_KEY]: Buffer.from("overwritten") }
    );
    await expect(receiptPdf(RECEIPT_ID, deps as never)).rejects.toThrow(
      "doesn't match its hash"
    );
  });

  it("puts back a missing stored file only when a fresh render matches", async () => {
    const repaired = harness(
      document({ stored: { key: SIGNED_KEY, sha256: sha("pdf:signed") } }),
      signature()
    );
    const result = await receiptPdf(RECEIPT_ID, repaired.deps as never);
    expect(result?.pdf.toString()).toBe("pdf:signed");
    expect(repaired.writes.map((w) => w.key)).toEqual([SIGNED_KEY]);

    const changed = harness(
      document({ stored: { key: SIGNED_KEY, sha256: sha("older template") } }),
      signature()
    );
    await expect(receiptPdf(RECEIPT_ID, changed.deps as never)).rejects.toThrow(
      "can't be re-created"
    );
    expect(changed.writes).toEqual([]);
  });

  it("renders a voided receipt afresh and never stores it", async () => {
    const { deps, writes } = harness(
      document({
        stored: { key: SIGNED_KEY, sha256: "x" },
        voidReason: "Wrong donor",
        voidedAt: new Date("2026-05-05T00:00:00Z"),
      }),
      signature()
    );
    await receiptPdf(RECEIPT_ID, deps as never);
    expect(deps.render.mock.calls[0]?.[0]).toMatchObject({
      voided: { reason: "Wrong donor" },
    });
    expect(writes).toEqual([]);
    expect(deps.recordStored).not.toHaveBeenCalled();
  });

  it("refuses to store a receipt whose signature can't be read", async () => {
    const { deps, writes } = harness(document(), {});
    await expect(receiptPdf(RECEIPT_ID, deps as never)).rejects.toThrow(
      "Receipt signature unreadable"
    );
    expect(writes).toEqual([]);
  });

  it("prints a receipt issued before signatures without one", async () => {
    const { deps } = harness(document({ signatureKey: null }), {});
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("pdf:unsigned");
  });

  it("returns null for an unknown receipt", async () => {
    const { deps } = harness(null, {});
    expect(await receiptPdf(RECEIPT_ID, deps as never)).toBeNull();
  });
});
