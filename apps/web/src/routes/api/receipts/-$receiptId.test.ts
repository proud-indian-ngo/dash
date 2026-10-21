import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({
  assertServerPermission: mock(),
  requireSession: mock(),
}));
mock.module("@/lib/audit", () => ({ runSessionAuditedAction: mock() }));
mock.module("@pi-dash/jobs/lib/receipt-pdf", () => ({
  receiptPdf: mock(),
}));

const { handleReceiptPdf } = await import("./$receiptId");
type Deps = NonNullable<Parameters<typeof handleReceiptPdf>[2]>;

const RECEIPT = "0190a000-0000-7000-8000-000000000002";
const request = new Request(`http://localhost/api/receipts/${RECEIPT}`);

function deps(granted: boolean, audits: unknown[] = []): Deps {
  return {
    assertPermission: (async (_session: unknown, permission: string) => {
      if (!(granted && permission === "donors.receipt")) {
        throw new Error("Forbidden");
      }
    }) as Deps["assertPermission"],
    audit: (async (
      _session: unknown,
      _headers: unknown,
      options: unknown,
      execute: () => Promise<unknown>,
      classify?: (result: unknown) => unknown
    ) => {
      const result = await execute();
      audits.push({ options, outcome: classify?.(result) ?? "success" });
      return result;
    }) as Deps["audit"],
    getSession: (async () => ({
      session: { user: { id: "u-1", role: "finance_admin" } },
    })) as unknown as Deps["getSession"],
    render: (async () => ({
      document: {},
      filename: "PI-2026-27-0001.pdf",
      pdf: Buffer.from("%PDF-1.4 test"),
    })) as unknown as Deps["render"],
  };
}

describe("receipt PDF download", () => {
  it("serves the PDF to receipt issuers and audits the download", async () => {
    const audits: unknown[] = [];
    const response = await handleReceiptPdf(
      request,
      RECEIPT,
      deps(true, audits)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="PI-2026-27-0001.pdf"'
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(audits).toEqual([
      {
        options: {
          action: "contribution_receipt.download",
          target: { id: RECEIPT, type: "contribution_receipt" },
        },
        outcome: "success",
      },
    ]);
  });

  it("opens the PDF inline when asked", async () => {
    const response = await handleReceiptPdf(
      new Request(
        `http://localhost/api/receipts/${RECEIPT}?disposition=inline`
      ),
      RECEIPT,
      deps(true, [])
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="PI-2026-27-0001.pdf"'
    );
  });

  it("refuses everyone without donors.receipt", async () => {
    const audits: unknown[] = [];
    const response = await handleReceiptPdf(
      request,
      RECEIPT,
      deps(false, audits)
    );
    expect(response.status).toBe(403);
    expect(audits).toEqual([]);
  });

  it("rejects a malformed ID and a missing receipt", async () => {
    expect((await handleReceiptPdf(request, "nope", deps(true))).status).toBe(
      400
    );
    const audits: unknown[] = [];
    const missing = {
      ...deps(true, audits),
      render: (async () => null) as never,
    };
    expect((await handleReceiptPdf(request, RECEIPT, missing)).status).toBe(
      404
    );
    // A missing receipt is audited as a failure, not a reveal.
    expect(audits).toMatchObject([{ outcome: "failure" }]);
  });
});
