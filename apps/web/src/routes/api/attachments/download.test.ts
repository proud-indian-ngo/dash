import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));

import { parseDownloadTarget } from "./download";

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
