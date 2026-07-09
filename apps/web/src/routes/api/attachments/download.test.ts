import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { R2_KEY_PREFIX: "app" },
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));

import { R2ObjectAccessError } from "@/lib/authorized-r2-object";
import {
  type AttachmentDownloadHandlerDeps,
  handleAttachmentDownloadRequest,
  parseDownloadTarget,
} from "./download";

const parse = (query: string) =>
  parseDownloadTarget(
    new URL(`https://example.test/api/attachments/download${query}`)
  );

const expectJsonError = async (
  response: Response,
  status: number,
  error: string
) => {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error });
};

const session = { user: { id: "user-1", role: "volunteer" } };

function createHandlerDeps(
  overrides: Partial<AttachmentDownloadHandlerDeps> = {}
): AttachmentDownloadHandlerDeps {
  return {
    assertCanDownloadR2Object: async () => ({
      filename: "receipt.pdf",
      key: "app/attachments/reimbursement/receipt.pdf",
    }),
    checkRateLimit: () => ({
      allowed: true,
      limit: 30,
      remaining: 29,
      resetAt: Date.now() + 60_000,
    }),
    fetch: async () =>
      new Response("file-body", {
        headers: { "content-type": "application/pdf" },
      }),
    getS3: () => ({
      presign: () => "https://r2.example.test/download",
    }),
    rateLimitResponse: () =>
      Response.json({ error: "Too many requests" }, { status: 429 }),
    requireSession: async () => ({ session }),
    ...overrides,
  };
}

describe("parseDownloadTarget", () => {
  it("parses persisted attachment targets", () => {
    expect(parse("?id=attachment-id&kind=reimbursementAttachment")).toEqual({
      id: "attachment-id",
      kind: "reimbursementAttachment",
    });
  });

  it("rejects missing kind", async () => {
    const result = parse("?id=attachment-id");

    expect(result).toBeInstanceOf(Response);
    await expectJsonError(result as Response, 400, "Invalid kind");
  });

  it("requires key for scheduled message attachments", async () => {
    const result = parse("?id=message-id&kind=scheduledMessageAttachment");

    expect(result).toBeInstanceOf(Response);
    await expectJsonError(result as Response, 400, "Missing key");
  });

  it("parses scheduled message attachment targets", () => {
    expect(
      parse(
        "?id=message-id&kind=scheduledMessageAttachment&key=app/scheduled-messages/message/media.png"
      )
    ).toEqual({
      id: "message-id",
      key: "app/scheduled-messages/message/media.png",
      kind: "scheduledMessageAttachment",
    });
  });
});

describe("handleAttachmentDownloadRequest", () => {
  const request = () =>
    new Request(
      "https://example.test/api/attachments/download?filename=receipt.pdf&id=attachment-id&kind=reimbursementAttachment"
    );

  it("returns 401 when there is no session", async () => {
    const response = await handleAttachmentDownloadRequest(
      request(),
      createHandlerDeps({
        requireSession: async () => ({
          error: Response.json({ error: "Unauthorized" }, { status: 401 }),
        }),
      })
    );

    await expectJsonError(response, 401, "Unauthorized");
  });

  it("returns 403 when authorization denies the object", async () => {
    const response = await handleAttachmentDownloadRequest(
      request(),
      createHandlerDeps({
        assertCanDownloadR2Object: () =>
          Promise.reject(new R2ObjectAccessError(403, "Forbidden")),
      })
    );

    await expectJsonError(response, 403, "Forbidden");
  });

  it("returns 404 when the resolved object is missing", async () => {
    const response = await handleAttachmentDownloadRequest(
      request(),
      createHandlerDeps({
        assertCanDownloadR2Object: () =>
          Promise.reject(new R2ObjectAccessError(404, "Object not found")),
      })
    );

    await expectJsonError(response, 404, "Asset not found");
  });

  it("proxies allowed objects with attachment headers", async () => {
    const response = await handleAttachmentDownloadRequest(
      request(),
      createHandlerDeps()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="receipt.pdf"'
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
    await expect(response.text()).resolves.toBe("file-body");
  });

  it("allows inline disposition for preview requests", async () => {
    const response = await handleAttachmentDownloadRequest(
      new Request(
        "https://example.test/api/attachments/download?disposition=inline&filename=receipt.pdf&id=attachment-id&kind=reimbursementAttachment"
      ),
      createHandlerDeps()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="receipt.pdf"'
    );
  });

  it("returns 404 when the upstream object fetch fails", async () => {
    const response = await handleAttachmentDownloadRequest(
      request(),
      createHandlerDeps({
        fetch: async () => new Response("missing", { status: 404 }),
      })
    );

    await expectJsonError(response, 404, "Asset not found");
  });
});
