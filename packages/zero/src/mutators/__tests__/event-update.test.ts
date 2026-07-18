import { describe, expect, it, vi } from "vitest";
import z from "zod";
import type { Context } from "../../context";
import { eventUpdateMutators } from "../event-update";

const createSchema = z.object({
  content: z.string().min(1).max(50_000),
  eventId: z.string(),
  id: z.string(),
  now: z.number(),
});

const approveSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const rejectSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const editSchema = z.object({
  content: z.string().min(1).max(50_000),
  id: z.string(),
  now: z.number(),
});

const deleteSchema = z.object({
  id: z.string(),
});

describe("eventUpdate mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        content: "This is an update about the event",
        eventId: "evt-1",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts content at max length (50000)", () => {
      const result = createSchema.safeParse({
        content: "x".repeat(50_000),
        eventId: "evt-1",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const result = createSchema.safeParse({
        content: "",
        eventId: "evt-1",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content over 50000 chars", () => {
      const result = createSchema.safeParse({
        content: "x".repeat(50_001),
        eventId: "evt-1",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = createSchema.safeParse({
        content: "Update text",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = createSchema.safeParse({
        content: "Update text",
        eventId: "evt-1",
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input", () => {
      const result = approveSchema.safeParse({
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = approveSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = approveSchema.safeParse({
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input", () => {
      const result = rejectSchema.safeParse({
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = rejectSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = rejectSchema.safeParse({
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("edit", () => {
    it("accepts valid input", () => {
      const result = editSchema.safeParse({
        content: "Updated content for the event",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const result = editSchema.safeParse({
        content: "",
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content over 50000 chars", () => {
      const result = editSchema.safeParse({
        content: "x".repeat(50_001),
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing content", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = editSchema.safeParse({
        content: "Some content",
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({
        id: "upd-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

const plate = (...urls: string[]) =>
  JSON.stringify([
    {
      children: [
        { text: "Update" },
        ...urls.map((url) => ({
          children: [{ text: "" }],
          type: "img",
          url,
        })),
      ],
      type: "p",
    },
  ]);

const mediaUrl =
  "/api/media/event-update?eventId=event-1&key=app%2Fupdates%2Fevent-1%2Fprivate.jpg";

const oversizedPlate = () =>
  JSON.stringify([
    {
      children: [
        {
          children: [{ text: "" }],
          type: "img",
          url: mediaUrl,
        },
      ],
      filler: Array.from({ length: 10_000 }, () => 0),
      type: "p",
    },
  ]);

const makeContext = (permissions: string[]): Context => ({
  asyncTasks: [],
  permissions,
  role: "volunteer",
  userId: "user-1",
});

const makeTx = (...rows: unknown[]) => {
  const insert = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const queue = [...rows];
  return {
    insert,
    tx: {
      location: "server",
      mutate: { eventUpdate: { insert, update } },
      run: vi.fn(async () => queue.shift()),
    },
    update,
  };
};

describe("eventUpdate media policy", () => {
  it("rejects a new image reference from an ordinary event member", async () => {
    const { insert, tx } = makeTx(
      { startTime: 0, teamId: "team-1" },
      undefined,
      { eventId: "event-1", userId: "user-1" }
    );

    await expect(
      eventUpdateMutators.create.fn({
        args: {
          content: plate(mediaUrl),
          eventId: "event-1",
          id: "update-1",
          now: 1,
        },
        ctx: makeContext([]),
        tx,
      } as never)
    ).rejects.toThrow("Update cannot contain new images");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects renderable image content that exceeds traversal limits", async () => {
    const content = oversizedPlate();
    expect(content.length).toBeLessThan(50_000);
    const { insert, tx } = makeTx(
      { startTime: 0, teamId: "team-1" },
      undefined,
      { eventId: "event-1", userId: "user-1" }
    );

    await expect(
      eventUpdateMutators.create.fn({
        args: {
          content,
          eventId: "event-1",
          id: "update-1",
          now: 1,
        },
        ctx: makeContext([]),
        tx,
      } as never)
    ).rejects.toThrow("Update cannot contain new images");
    expect(insert).not.toHaveBeenCalled();
  });

  it("allows an authorized creator to add an image reference", async () => {
    const { insert, tx } = makeTx(
      { name: "Event", startTime: 0, teamId: "team-1" },
      undefined,
      []
    );

    await eventUpdateMutators.create.fn({
      args: {
        content: plate(mediaUrl),
        eventId: "event-1",
        id: "update-1",
        now: 1,
      },
      ctx: makeContext(["event_updates.create"]),
      tx,
    } as never);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: plate(mediaUrl), status: "approved" })
    );
  });

  it("rejects a new image reference when an ordinary author edits", async () => {
    const { tx, update } = makeTx(
      {
        content: plate(),
        createdBy: "user-1",
        eventId: "event-1",
        id: "update-1",
        status: "pending",
      },
      { teamId: "team-1" },
      undefined
    );

    await expect(
      eventUpdateMutators.update.fn({
        args: { content: plate(mediaUrl), id: "update-1", now: 2 },
        ctx: makeContext(["event_updates.edit_own"]),
        tx,
      } as never)
    ).rejects.toThrow("Update cannot contain new images");
    expect(update).not.toHaveBeenCalled();
  });

  it("preserves an ordinary author's existing image reference", async () => {
    const { tx, update } = makeTx(
      {
        content: plate(mediaUrl),
        createdBy: "user-1",
        eventId: "event-1",
        id: "update-1",
        status: "pending",
      },
      { teamId: "team-1" },
      undefined
    );

    await eventUpdateMutators.update.fn({
      args: { content: plate(mediaUrl), id: "update-1", now: 2 },
      ctx: makeContext(["event_updates.edit_own"]),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith({
      content: plate(mediaUrl),
      id: "update-1",
      updatedAt: 2,
    });
  });

  it("preserves exact unchanged legacy content that exceeds traversal limits", async () => {
    const content = oversizedPlate();
    const { tx, update } = makeTx(
      {
        content,
        createdBy: "user-1",
        eventId: "event-1",
        id: "update-1",
        status: "pending",
      },
      { teamId: "team-1" },
      undefined
    );

    await eventUpdateMutators.update.fn({
      args: { content, id: "update-1", now: 2 },
      ctx: makeContext(["event_updates.edit_own"]),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith({
      content,
      id: "update-1",
      updatedAt: 2,
    });
  });
});
