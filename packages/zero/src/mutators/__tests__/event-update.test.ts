import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

import type { Context } from "../../context";
import { eventUpdateMutators } from "../event-update";

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
  const insert = mock(async () => undefined);
  const update = mock(async () => undefined);
  const queue = [...rows];
  return {
    insert,
    tx: {
      location: "server",
      mutate: { eventUpdate: { insert, update } },
      run: mock(async () => queue.shift()),
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

describe("eventUpdate.create time rule", () => {
  const NOW = Date.UTC(2026, 9, 1, 6);
  const HOUR = 3_600_000;
  // The server judges the start by its own clock; these run as the server.
  beforeAll(() => setSystemTime(new Date(NOW)));
  afterAll(() => setSystemTime());

  it("judges the start by the server's clock, not a client's set ahead", async () => {
    const { insert, tx } = makeTx({ startTime: NOW + HOUR, teamId: "team-1" });

    await expect(
      eventUpdateMutators.create.fn({
        args: {
          content: plate(),
          eventId: "event-1",
          id: "update-1",
          now: NOW + 2 * HOUR,
        },
        ctx: makeContext(["event_updates.create"]),
        tx,
      } as never)
    ).rejects.toThrow("Cannot post updates before event starts");
    expect(insert).not.toHaveBeenCalled();
  });
});
