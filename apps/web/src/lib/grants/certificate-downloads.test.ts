import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({ requireSession: mock() }));
mock.module("@/lib/audit", () => ({ runSessionAuditedAction: mock() }));
mock.module("@/lib/s3", () => ({ getS3: mock() }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: mock(),
}));
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  getCertificate: mock(),
}));

const ID = "0190a000-0000-7000-8000-0000000000a1";

mock.module("@/lib/governance/vault", () => ({
  safeFileName: (name: string) =>
    name
      .trim()
      .replaceAll(/[\r\n"\\/]/g, "")
      .replaceAll(/\s+/g, "-")
      .replaceAll(/[^A-Za-z0-9._-]/g, "")
      .slice(-120) || "document",
}));

const { certificatePdfName, handleCertificateFileDownload } =
  await import("./certificate-downloads");
type Deps = NonNullable<Parameters<typeof handleCertificateFileDownload>[2]>;

function deps(
  user: { id: string; permissions: string[] },
  audits: unknown[] = [],
  caFilename = "ca.pdf"
): Deps {
  return {
    audit: (async (
      _session: unknown,
      _headers: unknown,
      options: unknown,
      execute: () => Promise<unknown>
    ) => {
      audits.push(options);
      return await execute();
    }) as Deps["audit"],
    findCertificate: (async () => ({
      caFilename,
      caObjectKey: "test/ca.pdf",
      financeUserId: "cfo",
      headUserId: "head",
      latestObjectKey: "test/latest.pdf",
      number: "UC/2026-27/001",
    })) as unknown as Deps["findCertificate"],
    getSession: (async () => ({
      session: { user: { id: user.id, role: "volunteer" } },
    })) as unknown as Deps["getSession"],
    permissionsOf: async () => user.permissions,
    readObject: async () => new TextEncoder().encode("%PDF").buffer,
  };
}

const get = (file: string, d: Deps) =>
  handleCertificateFileDownload(
    new Request(
      `http://localhost/api/utilisation-certificates/${ID}?file=${file}`
    ),
    ID,
    d
  );

describe("utilisation certificate downloads", () => {
  it("serves finance readers both files, audited as downloads", async () => {
    const audits: unknown[] = [];
    const finance = deps({ id: "f-1", permissions: ["finance.view"] }, audits);
    expect((await get("latest", finance)).status).toBe(200);
    const ca = await get("ca", finance);
    expect(ca.status).toBe(200);
    expect(ca.headers.get("Content-Disposition")).toContain("ca.pdf");
    expect(audits).toEqual([
      expect.objectContaining({
        action: "utilisation_certificate.download",
        metadata: { file: "latest" },
      }),
      expect.objectContaining({ metadata: { file: "ca" } }),
    ]);
  });

  it("lets a signer without finance.view fetch only the copy they sign", async () => {
    const audits: unknown[] = [];
    const signer = deps({ id: "cfo", permissions: [] }, audits);
    expect((await get("latest", signer)).status).toBe(200);
    expect((await get("ca", signer)).status).toBe(403);
    const stranger = deps({ id: "someone", permissions: [] }, audits);
    expect((await get("latest", stranger)).status).toBe(403);
    expect(audits).toHaveLength(1);
  });
});

describe("certificate PDF names", () => {
  it("keeps names safe for a header, a Hindi one included", async () => {
    expect(certificatePdfName("CA report 2026.pdf")).toBe("CA-report-2026.pdf");
    expect(certificatePdfName("प्रमाणपत्र.pdf")).toBe("ca-certificate.pdf");
    // A row stored before names were cleaned still downloads.
    const reply = await get(
      "ca",
      deps({ id: "f-1", permissions: ["finance.view"] }, [], "सीए रिपोर्ट.pdf")
    );
    expect(reply.status).toBe(200);
    expect(reply.headers.get("Content-Disposition")).toBe(
      'attachment; filename="ca-certificate.pdf"'
    );
  });
});
