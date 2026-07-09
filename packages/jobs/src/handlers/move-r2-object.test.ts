import type { Job } from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveR2ObjectPayload } from "../types";

const r2Mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  file: vi.fn((key: string, options?: { type: string }) => ({
    key,
    options,
  })),
  write: vi.fn(),
}));

vi.mock("./r2", () => ({
  getR2Client: () => r2Mocks,
}));

vi.mock("./create-handler", () => ({
  createNotifyHandler:
    (
      _queueName: string,
      getHandler: () => Promise<(data: MoveR2ObjectPayload) => Promise<void>>
    ) =>
    async (jobs: Job<MoveR2ObjectPayload>[]) => {
      const handler = await getHandler();
      await Promise.all(jobs.map((item) => handler(item.data)));
      return { ok: true };
    },
}));

import { handleMoveR2Object } from "./move-r2-object";

const job = (data: MoveR2ObjectPayload): Job<MoveR2ObjectPayload>[] => [
  { data, id: "job-1" } as Job<MoveR2ObjectPayload>,
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleMoveR2Object", () => {
  it("copies the source object to the target key and deletes the source", async () => {
    await handleMoveR2Object(
      job({
        mimeType: "application/pdf",
        sourceKey: "app/attachments/tmp/user-1/file.pdf",
        targetKey: "app/attachments/reimbursements/request-1/file.pdf",
      })
    );

    expect(r2Mocks.file).toHaveBeenCalledWith(
      "app/attachments/tmp/user-1/file.pdf",
      { type: "application/pdf" }
    );
    expect(r2Mocks.write).toHaveBeenCalledWith(
      "app/attachments/reimbursements/request-1/file.pdf",
      {
        key: "app/attachments/tmp/user-1/file.pdf",
        options: { type: "application/pdf" },
      },
      { type: "application/pdf" }
    );
    expect(r2Mocks.delete).toHaveBeenCalledWith(
      "app/attachments/tmp/user-1/file.pdf"
    );
  });

  it("skips no-op moves", async () => {
    await handleMoveR2Object(
      job({
        sourceKey: "app/attachments/request/file.pdf",
        targetKey: "app/attachments/request/file.pdf",
      })
    );

    expect(r2Mocks.file).not.toHaveBeenCalled();
    expect(r2Mocks.write).not.toHaveBeenCalled();
    expect(r2Mocks.delete).not.toHaveBeenCalled();
  });

  it("rejects and leaves source untouched when copy fails", async () => {
    r2Mocks.write.mockRejectedValueOnce(new Error("copy failed"));

    await expect(
      handleMoveR2Object(
        job({
          sourceKey: "app/attachments/tmp/user-1/file.pdf",
          targetKey: "app/attachments/reimbursements/request-1/file.pdf",
        })
      )
    ).rejects.toThrow("copy failed");

    expect(r2Mocks.delete).not.toHaveBeenCalled();
  });

  it("rejects when source delete fails after copy", async () => {
    r2Mocks.delete.mockRejectedValueOnce(new Error("delete failed"));

    await expect(
      handleMoveR2Object(
        job({
          sourceKey: "app/attachments/tmp/user-1/file.pdf",
          targetKey: "app/attachments/reimbursements/request-1/file.pdf",
        })
      )
    ).rejects.toThrow("delete failed");

    expect(r2Mocks.write).toHaveBeenCalledTimes(1);
    expect(r2Mocks.delete).toHaveBeenCalledWith(
      "app/attachments/tmp/user-1/file.pdf"
    );
  });
});
