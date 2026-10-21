import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({
  assertServerPermission: mock(),
  requireSession: mock(),
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptConfig: mock(),
}));

const { handleReceiptSignature } = await import("./signature");
type Deps = NonNullable<Parameters<typeof handleReceiptSignature>[1]>;

const request = new Request("http://localhost/api/receipts/signature");
const SIGNATURE_KEY = "app/attachments/receipt-signatures/signature.png";

function deps(options: {
  granted?: boolean;
  image?: ArrayBuffer | null;
  read?: Deps["read"];
  signedIn?: boolean;
  signatureKey?: string | null;
}): Deps {
  const {
    granted = true,
    signedIn = true,
    signatureKey = SIGNATURE_KEY,
  } = options;
  return {
    assertPermission: (async (_session: unknown, permission: string) => {
      if (!(granted && permission === "finance.manage")) {
        throw new Error("Forbidden");
      }
    }) as Deps["assertPermission"],
    getSession: (async () =>
      signedIn
        ? { session: { user: { id: "u-1", role: "finance_admin" } } }
        : {
            error: Response.json({ error: "Unauthorized" }, { status: 401 }),
          }) as unknown as Deps["getSession"],
    loadConfig: (async () => ({
      registration: null,
      settings: signatureKey ? { signatureKey } : null,
      signatureMissing: false,
    })) as unknown as Deps["loadConfig"],
    read:
      options.read ??
      (async (key) =>
        key === SIGNATURE_KEY ? (options.image ?? new ArrayBuffer(4)) : null),
  };
}

describe("receipt signature preview", () => {
  it("serves the current signature to finance.manage, never cached", async () => {
    const response = await handleReceiptSignature(request, deps({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("refuses the signed out and anyone without finance.manage", async () => {
    expect(
      (await handleReceiptSignature(request, deps({ signedIn: false }))).status
    ).toBe(401);
    expect(
      (await handleReceiptSignature(request, deps({ granted: false }))).status
    ).toBe(403);
  });

  it("answers 404 without a signature, and 500 when storage fails", async () => {
    expect(
      (await handleReceiptSignature(request, deps({ signatureKey: null })))
        .status
    ).toBe(404);
    expect(
      (
        await handleReceiptSignature(
          request,
          deps({ image: null, read: async () => null })
        )
      ).status
    ).toBe(404);
    const failing = deps({
      read: async () => {
        throw new Error("R2 down");
      },
    });
    expect((await handleReceiptSignature(request, failing)).status).toBe(500);
  });
});
