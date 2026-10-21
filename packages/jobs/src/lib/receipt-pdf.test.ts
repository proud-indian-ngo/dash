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
    version: 2,
    voidedAt: null,
    voidReason: null,
    with80G: false,
    ...overrides,
  };
}

function harness(doc: ReceiptDocument | null, files: Record<string, Buffer>) {
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
        return data.byteLength;
      },
    }),
    keyPrefix: "app",
    loadDocument: mock(async () => doc),
    recordStored: mock(async () => undefined),
    render: mock(async (props: { signatureImage: Buffer | null }) =>
      Buffer.from(`pdf:${props.signatureImage ? "signed" : "unsigned"}`)
    ),
  };
  return { deps, writes };
}

describe("receiptPdf", () => {
  it("renders an unstored receipt with its signature, then stores it", async () => {
    const { deps, writes } = harness(document(), {
      [SIGNATURE_KEY]: pngHeader(),
    });
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("pdf:signed");
    expect(result?.filename).toBe("PI-2026-27-0001.pdf");
    expect(writes.map((w) => w.key)).toEqual([
      `app/receipts/${RECEIPT_ID}.pdf`,
    ]);
    expect(deps.recordStored).toHaveBeenCalledWith(RECEIPT_ID, {
      key: `app/receipts/${RECEIPT_ID}.pdf`,
      sha256: createHash("sha256").update("pdf:signed").digest("hex"),
    });
  });

  it("serves a stored receipt as stored, without rendering", async () => {
    const key = `app/receipts/${RECEIPT_ID}.pdf`;
    const { deps, writes } = harness(
      document({ stored: { key, sha256: "x" } }),
      { [key]: Buffer.from("stored bytes") }
    );
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("stored bytes");
    expect(deps.render).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("renders a voided receipt afresh and never stores it", async () => {
    const key = `app/receipts/${RECEIPT_ID}.pdf`;
    const { deps, writes } = harness(
      document({
        stored: { key, sha256: "x" },
        voidReason: "Wrong donor",
        voidedAt: new Date("2026-05-05T00:00:00Z"),
      }),
      { [SIGNATURE_KEY]: pngHeader() }
    );
    await receiptPdf(RECEIPT_ID, deps as never);
    expect(deps.render).toHaveBeenCalledTimes(1);
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
    const { deps } = harness(document({ signatureKey: null, version: 1 }), {});
    const result = await receiptPdf(RECEIPT_ID, deps as never);
    expect(result?.pdf.toString()).toBe("pdf:unsigned");
  });

  it("returns null for an unknown receipt", async () => {
    const { deps } = harness(null, {});
    expect(await receiptPdf(RECEIPT_ID, deps as never)).toBeNull();
  });
});
