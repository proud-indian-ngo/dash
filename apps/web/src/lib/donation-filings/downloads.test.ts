import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({
  assertServerPermission: mock(),
  requireSession: mock(),
}));
mock.module("@/lib/audit", () => ({ runSessionAuditedAction: mock() }));
mock.module("@/lib/s3", () => ({ getS3: mock() }));
mock.module("@pi-dash/db/queries/donation-filings", () => ({
  loadCertificateFile: async (id: string) =>
    id === CERTIFICATE
      ? {
          acknowledgementNumber: "114000000000001",
          fileObjectKey: "test/donation-filings/f/certificates/c.pdf",
        }
      : null,
  loadFilingHeader: async () => ({
    fileName: "donations-return-FY2026-27-filing-1.csv",
    fileObjectKey: "test/donation-filings/f/file.csv",
  }),
}));

const CERTIFICATE = "0190a000-0000-7000-8000-0000000000c1";
const OTHER = "0190a000-0000-7000-8000-0000000000c2";
const FILING = "0190a000-0000-7000-8000-0000000000f1";

const { handleCertificateDownload, handleFilingFileDownload } =
  await import("./downloads");
type Deps = NonNullable<Parameters<typeof handleCertificateDownload>[2]>;

function deps(granted: string[], audits: unknown[] = []): Deps {
  return {
    assertPermission: (async (_session: unknown, permission: string) => {
      if (!granted.includes(permission)) {
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
    readObject: async () => new TextEncoder().encode("%PDF").buffer,
  };
}

const request = (path: string) => new Request(`http://localhost${path}`);

describe("filing downloads", () => {
  it("refuses without finance.view_sensitive and reveals nothing", async () => {
    const audits: unknown[] = [];
    const response = await handleCertificateDownload(
      request(`/api/donation-certificates/${CERTIFICATE}`),
      CERTIFICATE,
      deps(["finance.manage", "finance.view"], audits)
    );
    expect(response.status).toBe(403);
    expect(audits).toEqual([]);
  });

  it("audits each certificate download, and a missing one as a failure", async () => {
    const audits: unknown[] = [];
    const response = await handleCertificateDownload(
      request(`/api/donation-certificates/${CERTIFICATE}?disposition=inline`),
      CERTIFICATE,
      deps(["finance.view_sensitive"], audits)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="Form-114-114000000000001.pdf"'
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const missing = await handleCertificateDownload(
      request(`/api/donation-certificates/${OTHER}`),
      OTHER,
      deps(["finance.view_sensitive"], audits)
    );
    expect(missing.status).toBe(404);
    expect(audits).toEqual([
      {
        options: {
          action: "donation_certificate.download",
          target: { id: CERTIFICATE, type: "donation_certificate" },
        },
        outcome: "success",
      },
      {
        options: {
          action: "donation_certificate.download",
          target: { id: OTHER, type: "donation_certificate" },
        },
        outcome: "failure",
      },
    ]);
  });

  it("serves a filing's upload file as recorded", async () => {
    const audits: unknown[] = [];
    const response = await handleFilingFileDownload(
      request(`/api/donation-filings/${FILING}`),
      FILING,
      deps(["finance.view_sensitive"], audits)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="donations-return-FY2026-27-filing-1.csv"'
    );
    expect(audits).toHaveLength(1);
  });

  it("rejects an ID that isn't a UUID", async () => {
    const response = await handleFilingFileDownload(
      request("/api/donation-filings/x"),
      "x",
      deps(["finance.view_sensitive"])
    );
    expect(response.status).toBe(400);
  });
});
