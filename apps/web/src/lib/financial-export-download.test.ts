import { describe, expect, it, vi } from "vitest";
import type { FinancialExportInput } from "./financial-export-contract";
import { downloadFinancialExport } from "./financial-export-download";

const input: FinancialExportInput = {
  fyStart: 2026,
  includeTransactions: false,
  includeVendorPayments: false,
  requestStatuses: ["approved"],
  requestTypes: ["reimbursement", "advancePayment"],
};

describe("downloadFinancialExport", () => {
  it("downloads the returned ZIP filename and exposes export counts", async () => {
    const fetchExport = vi.fn(
      async () =>
        new Response("zip bytes", {
          headers: {
            "Content-Disposition":
              'attachment; filename="financial-exports_FY2026-27_server.zip"',
            "Content-Type": "application/zip",
            "X-Export-Request-Count": "3",
            "X-Export-Transaction-Count": "1",
            "X-Export-Vendor-Payment-Count": "2",
          },
        })
    );
    const saveBlob = vi.fn();

    const result = await downloadFinancialExport(input, {
      fetch: fetchExport,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
      saveBlob,
    });

    expect(fetchExport).toHaveBeenCalledWith(
      "/api/financial-export?fyStart=2026&includeTransactions=false&includeVendorPayments=false&requestType=reimbursement&requestType=advancePayment&requestStatus=approved"
    );
    expect(saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "financial-exports_FY2026-27_server.zip"
    );
    expect(result).toEqual({
      requestCount: 3,
      transactionCount: 1,
      vendorPaymentCount: 2,
    });
  });

  it("surfaces the server error without saving a partial download", async () => {
    const saveBlob = vi.fn();

    await expect(
      downloadFinancialExport(input, {
        fetch: vi.fn(async () =>
          Response.json(
            { error: "Financial export could not be generated" },
            { status: 500 }
          )
        ),
        now: () => new Date("2026-08-11T00:00:00.000Z"),
        saveBlob,
      })
    ).rejects.toThrow("Financial export could not be generated");
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
