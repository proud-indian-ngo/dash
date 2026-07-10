// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));
vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { R2_KEY_PREFIX: "app" },
}));

import { R2ObjectAccessError } from "@/lib/r2-object-access";
import {
  type AttachmentDownloadHandlerDeps,
  handleAttachmentDownloadRequest,
  parseAttachmentDownloadRef,
} from "./download";

const ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000005";

const handlerDeps = (
  overrides: Partial<AttachmentDownloadHandlerDeps> = {}
): AttachmentDownloadHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  fetch: async () => new Response("file"),
  getS3: () => ({ presign: () => "https://r2.example.test/file" }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  requireSession: async () => ({
    error: Response.json({ error: "Unauthorized" }, { status: 401 }),
  }),
  resolveAuthorizedR2Object: async () => ({
    filename: "receipt.pdf",
    key: "legacy/receipt.pdf",
  }),
  ...overrides,
});

describe("parseAttachmentDownloadRef", () => {
  it("parses an attachment ID and kind without accepting a raw object key", () => {
    expect(
      parseAttachmentDownloadRef(
        new URL(
          `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment&key=app/attachments/secret.pdf`
        )
      )
    ).toEqual({ id: ATTACHMENT_ID, kind: "reimbursementAttachment" });
  });

  it("rejects malformed database IDs", () => {
    const response = parseAttachmentDownloadRef(
      new URL(
        "https://example.test/api/attachments/download?id=not-a-uuid&kind=reimbursementAttachment"
      )
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });
});

describe("handleAttachmentDownloadRequest", () => {
  it("returns 401 before resolving an asset reference", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the exact DB record is not authorized", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        requireSession: async () => ({
          session: { user: { id: "other", role: "volunteer" } },
        }),
        resolveAuthorizedR2Object: () =>
          Promise.reject(new R2ObjectAccessError(403, "Forbidden")),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 404 when the asset reference has no exact DB match", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
        resolveAuthorizedR2Object: () =>
          Promise.reject(new R2ObjectAccessError(404, "Object not found")),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Asset not found",
    });
  });

  it("streams an authorized object using its persisted filename", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        fetch: async () =>
          new Response("file-body", {
            headers: { "content-type": "application/pdf" },
          }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="receipt.pdf"'
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("file-body");
  });

  it("allows inline rendering only for safe media types", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?disposition=inline&id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        fetch: async () =>
          new Response("image", { headers: { "content-type": "image/png" } }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="receipt.pdf"'
    );
  });

  it("allows inline preview for PDF attachments", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?disposition=inline&id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        fetch: async () =>
          new Response("pdf", {
            headers: { "content-type": "application/pdf" },
          }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="receipt.pdf"'
    );
  });

  it("encodes non-ASCII filenames for inline PDF previews", async () => {
    const filename = "रसीद-📄.pdf";
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?disposition=inline&id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        fetch: async () =>
          new Response("pdf", {
            headers: { "content-type": "application/pdf" },
          }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
        resolveAuthorizedR2Object: async () => ({
          filename,
          key: "legacy/receipt.pdf",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `inline; filename="____-_.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
  });

  it("forces unsafe media types to download", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?disposition=inline&id=${ATTACHMENT_ID}&kind=reimbursementAttachment`
      ),
      handlerDeps({
        fetch: async () =>
          new Response("svg", { headers: { "content-type": "image/svg+xml" } }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="receipt.pdf"'
    );
  });

  it("forwards byte ranges and partial response headers", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("partial", {
          headers: {
            "accept-ranges": "bytes",
            "content-length": "7",
            "content-range": "bytes 0-6/20",
            "content-type": "video/mp4",
          },
          status: 206,
        })
    );
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`,
        { headers: { Range: "bytes=0-6" } }
      ),
      handlerDeps({
        fetch,
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(fetch).toHaveBeenCalledWith("https://r2.example.test/file", {
      headers: { Range: "bytes=0-6" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("7");
    expect(response.headers.get("content-range")).toBe("bytes 0-6/20");
  });

  it("preserves unsatisfiable range responses", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        `https://example.test/api/attachments/download?id=${ATTACHMENT_ID}&kind=reimbursementAttachment`,
        { headers: { Range: "bytes=999-1000" } }
      ),
      handlerDeps({
        fetch: async () =>
          new Response(null, {
            headers: { "content-range": "bytes */20" },
            status: 416,
          }),
        requireSession: async () => ({ session: { user: { id: "owner" } } }),
      })
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */20");
  });
});
