import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncTask, Context } from "../../context";
import { eventPhotoMutators } from "../event-photo";
import { reimbursementMutators } from "../reimbursement";
import { scheduledMessageMutators } from "../scheduled-message";

const copyR2Object = vi.fn();
const enqueue = vi.fn();

const serverContext = (permissions: string[] = []): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object,
  enqueue: enqueue as Context["enqueue"],
  permissions,
  r2KeyPrefix: "app",
  role: "volunteer",
  userId: "user-1",
});

const taskByMutator = (tasks: AsyncTask[], mutator: string) =>
  tasks.find((task) => task.meta.mutator === mutator);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("server mutator upload claims", () => {
  it("preserves an existing approval screenshot when no replacement is supplied", async () => {
    const approvalScreenshotKey =
      "app/approval-screenshots/reimbursements/request-1/approval-screenshots/proof.png";
    const update = vi.fn();
    const ctx = serverContext(["requests.approve"]);
    const tx = {
      location: "server",
      mutate: {
        reimbursement: { update },
        reimbursementHistory: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          approvalScreenshotKey,
          status: "pending",
          title: "Travel",
          userId: "owner-1",
        })
        .mockResolvedValueOnce([]),
    };

    await reimbursementMutators.approve.fn({
      args: { id: "request-1" },
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ approvalScreenshotKey, id: "request-1" })
    );
    expect(
      taskByMutator(
        ctx.asyncTasks ?? [],
        "reimbursement.approve:replaceApprovalScreenshot"
      )
    ).toBeUndefined();
  });

  it("claims scheduled-message attachments before persisting them", async () => {
    const insertMessage = vi.fn();
    const ctx = serverContext(["messages.schedule"]);
    const tx = {
      location: "server",
      mutate: {
        scheduledMessage: { insert: insertMessage },
        scheduledMessageRecipient: { insert: vi.fn() },
      },
      run: vi.fn(),
    };
    const sourceKey =
      "app/scheduled-messages/tmp/user-1/upload-id-voice-note.mp3";
    const targetKey =
      "app/scheduled-messages/message-1/upload-id-voice-note.mp3";

    await scheduledMessageMutators.create.fn({
      args: {
        attachments: [
          {
            fileName: "voice-note.mp3",
            mimeType: "audio/mpeg",
            r2Key: sourceKey,
          },
        ],
        id: "message-1",
        message: "Listen",
        recipients: [{ id: "group-1", label: "Group", type: "group" }],
        scheduledAt: Date.now() + 60_000,
      },
      ctx,
      tx,
    } as never);

    expect(insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            fileName: "voice-note.mp3",
            mimeType: "audio/mpeg",
            r2Key: targetKey,
          },
        ],
      })
    );
    await ctx.beforeCommitTasks?.[0]?.fn();
    expect(copyR2Object).toHaveBeenCalledWith({
      mimeType: "audio/mpeg",
      sourceKey,
      targetKey,
    });
    await taskByMutator(
      ctx.asyncTasks ?? [],
      "cleanup-claimed-r2-source"
    )?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { r2Key: sourceKey },
      { traceId: undefined }
    );
  });

  it("claims an event photo under its event before inserting the row", async () => {
    const insertPhoto = vi.fn();
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: { eventPhoto: { insert: insertPhoto } },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          name: "Cleanup",
          startTime: 1,
          teamId: "team-1",
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: "member-1" }),
    };
    const sourceKey = "app/photos/tmp/user-1/upload-id-photo.jpg";
    const targetKey = "app/photos/event-1/upload-id-photo.jpg";

    await eventPhotoMutators.upload.fn({
      args: {
        eventId: "event-1",
        id: "photo-1",
        mimeType: "image/jpeg",
        now: 2,
        r2Key: sourceKey,
      },
      ctx,
      tx,
    } as never);

    expect(insertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ r2Key: targetKey, status: "pending" })
    );
    await ctx.beforeCommitTasks?.[0]?.fn();
    expect(copyR2Object).toHaveBeenCalledWith({
      mimeType: "image/jpeg",
      sourceKey,
      targetKey,
    });
  });

  it("does not delete an event-photo key outside the owning event", async () => {
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: { eventPhoto: { delete: vi.fn() } },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          eventId: "event-1",
          r2Key: "app/photos/other-event/photo.jpg",
          status: "pending",
          uploadedBy: "user-1",
        })
        .mockResolvedValueOnce({ name: "Cleanup", teamId: "team-1" }),
    };

    await eventPhotoMutators.delete.fn({
      args: { id: "photo-1" },
      ctx,
      tx,
    } as never);

    expect(
      taskByMutator(ctx.asyncTasks ?? [], "deleteEventPhoto")
    ).toBeUndefined();
  });
});
