// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

const { requestLog } = vi.hoisted(() => ({
  requestLog: {
    emit: vi.fn(),
    error: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("evlog", () => ({
  createRequestLogger: vi.fn(() => requestLog),
}));
vi.mock("@/lib/api-auth", () => ({
  assertServerPermission: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));
vi.mock("@/lib/server/financial-export", () => ({
  getFinancialExportData: vi.fn(),
}));

import type { FinancialExportData } from "@/lib/server/financial-export";

import {
  type FinancialExportHandlerDependencies,
  handleFinancialExportRequest,
} from "./financial-export";

const exportUrl =
  "http://localhost/api/financial-export?fyStart=2026&includeTransactions=false&includeVendorPayments=false&requestType=reimbursement";

const exportData = (
  overrides: Partial<FinancialExportData> = {}
): FinancialExportData => ({
  attachments: [],
  csvFiles: [
    {
      filename: "reimbursements.csv",
      headers: ["Title"],
      rows: [["Travel"]],
    },
  ],
  requestCount: 1,
  transactionCount: 0,
  vendorPaymentCount: 0,
  ...overrides,
});

function dependencies(data = exportData()): FinancialExportHandlerDependencies {
  return {
    assertPermission: vi.fn(async () => undefined),
    getData: vi.fn(async () => data),
    getS3: vi.fn(() => ({
      file: vi.fn(() => ({
        stat: vi.fn(async () => ({})),
        stream: vi.fn(() => new Blob(["attachment"]).stream()),
      })),
    })),
    getSession: vi.fn(async () => ({
      session: { user: { id: "finance-user", role: "system" } },
    })) as unknown as FinancialExportHandlerDependencies["getSession"],
    now: () => new Date("2026-08-11T00:00:00.000Z"),
  };
}

describe("financial export API", () => {
  it("returns session failures before parsing the export", async () => {
    const deps = dependencies();
    deps.getSession = vi.fn(async () => ({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }));

    const response = await handleFinancialExportRequest(
      new Request(exportUrl),
      deps
    );

    expect(response.status).toBe(401);
    expect(deps.assertPermission).not.toHaveBeenCalled();
  });

  it("rejects invalid query options", async () => {
    const deps = dependencies();
    const response = await handleFinancialExportRequest(
      new Request("http://localhost/api/financial-export?fyStart=invalid"),
      deps
    );

    expect(response.status).toBe(400);
    expect(deps.assertPermission).not.toHaveBeenCalled();
    expect(deps.getData).not.toHaveBeenCalled();
  });

  it("rejects users without export permission", async () => {
    const deps = dependencies();
    deps.assertPermission = vi.fn(() => Promise.reject(new Error("Forbidden")));

    const response = await handleFinancialExportRequest(
      new Request(exportUrl),
      deps
    );

    expect(response.status).toBe(403);
    expect(deps.getData).not.toHaveBeenCalled();
  });

  it("always returns a private ZIP and forwards validated filters", async () => {
    const deps = dependencies();
    const response = await handleFinancialExportRequest(
      new Request(exportUrl),
      deps
    );

    expect(deps.getData).toHaveBeenCalledWith(
      {
        fyStart: 2026,
        includeTransactions: false,
        includeVendorPayments: false,
        requestStatuses: undefined,
        requestTypes: ["reimbursement"],
        vendorPaymentStatuses: undefined,
      },
      "http://localhost",
      "2026-08-11"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "financial-exports_FY2026-27_2026-08-11.zip"
    );
    expect(response.headers.get("x-export-request-count")).toBe("1");
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(archive)).toEqual(["reimbursements.csv"]);
    expect(strFromU8(archive["reimbursements.csv"] ?? new Uint8Array())).toBe(
      "Title\nTravel"
    );
    expect(requestLog.emit).toHaveBeenCalled();
  });

  it("preflights and includes selected stored attachments", async () => {
    const data = exportData({
      attachments: [
        {
          filename: "receipt.pdf",
          id: "attachment-1",
          objectKey: "app/attachments/receipt.pdf",
          parentId: "request-1",
          parentTitle: "Travel",
          requestType: "reimbursements",
        },
      ],
    });
    const deps = dependencies(data);
    const s3 = deps.getS3();
    deps.getS3 = vi.fn(() => s3);
    const response = await handleFinancialExportRequest(
      new Request(exportUrl),
      deps
    );
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));

    expect(s3.file).toHaveBeenCalledWith("app/attachments/receipt.pdf");
    expect(
      strFromU8(
        archive["attachments/reimbursements/request-1_Travel/receipt.pdf"] ??
          new Uint8Array()
      )
    ).toBe("attachment");
  });

  it("fails the export when an attachment cannot be preflighted", async () => {
    const deps = dependencies(
      exportData({
        attachments: [
          {
            filename: "missing.pdf",
            id: "attachment-1",
            objectKey: "missing.pdf",
            parentId: "request-1",
            parentTitle: "Travel",
            requestType: "reimbursements",
          },
        ],
      })
    );
    deps.getS3 = vi.fn(() => ({
      file: vi.fn(() => ({
        stat: vi.fn(() => Promise.reject(new Error("Not found"))),
        stream: vi.fn(() => new Blob().stream()),
      })),
    }));

    const response = await handleFinancialExportRequest(
      new Request(exportUrl),
      deps
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Financial export could not be generated",
    });
    expect(requestLog.error).toHaveBeenCalled();
  });
});
