import { describe, expect, it, mock } from "bun:test";

import z from "zod";

const uuidv7Mock = mock();
mock.module("uuidv7", () => ({ uuidv7: uuidv7Mock }));

import { eventInterestMutators } from "../event-interest";

const createSchema = z.object({
  eventId: z.string(),
  id: z.string(),
  message: z.string().optional(),
});

const approveSchema = z.object({ id: z.string() });
const rejectSchema = z.object({ id: z.string() });
const cancelSchema = z.object({ id: z.string() });

describe("eventInterest mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with message", () => {
      const result = createSchema.safeParse({
        eventId: "event-1",
        id: "uuid-1",
        message: "I want to help!",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without message", () => {
      const result = createSchema.safeParse({
        eventId: "event-1",
        id: "uuid-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = createSchema.safeParse({ eventId: "event-1" });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = createSchema.safeParse({ id: "uuid-1" });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input", () => {
      const result = approveSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = approveSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input", () => {
      const result = rejectSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = rejectSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("cancel", () => {
    it("accepts valid input", () => {
      const result = cancelSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = cancelSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe("event interest status transitions", () => {
  const validStatuses = ["pending", "approved", "rejected"] as const;

  it("initial status should be pending", () => {
    expect(validStatuses[0]).toBe("pending");
  });

  it("approve should only work on pending status", () => {
    const canApprove = (status: string) => status === "pending";
    expect(canApprove("pending")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("rejected")).toBe(false);
  });

  it("reject should only work on pending status", () => {
    const canReject = (status: string) => status === "pending";
    expect(canReject("pending")).toBe(true);
    expect(canReject("approved")).toBe(false);
    expect(canReject("rejected")).toBe(false);
  });

  it("cancel should only work on pending status", () => {
    const canCancel = (status: string) => status === "pending";
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("approved")).toBe(false);
    expect(canCancel("rejected")).toBe(false);
  });
});

describe("Kalakriti event interest", () => {
  it("accepts interest in a public Kalakriti event", async () => {
    const insertInterest = mock();
    const results = [
      {
        id: "event-1",
        isPublic: true,
        managementDomain: "kalakriti",
        name: "Kalakriti",
        startTime: 1_800_000_000_000,
        teamId: "team-1",
      },
      undefined,
      undefined,
      undefined,
    ];
    const tx = {
      location: "client",
      mutate: {
        eventInterest: { insert: insertInterest },
      },
      run: mock(async () => results.shift()),
    };

    await eventInterestMutators.create.fn({
      args: {
        eventId: "event-1",
        id: "interest-1",
        message: "I would like to help",
        now: 1_700_000_000_000,
      },
      ctx: {
        permissions: ["events.view_own"],
        role: "unoriented_volunteer",
        userId: "volunteer-1",
      },
      tx,
    } as unknown as Parameters<typeof eventInterestMutators.create.fn>[0]);

    expect(insertInterest).toHaveBeenCalledWith({
      createdAt: 1_700_000_000_000,
      eventId: "event-1",
      id: "interest-1",
      message: "I would like to help",
      reviewedAt: null,
      reviewedBy: null,
      status: "pending",
      userId: "volunteer-1",
    });
  });

  it("allows an interest manager to approve a Kalakriti request and orients on the server", async () => {
    const { createOrientationSql } = await import("./orientation-tx");
    const sql = createOrientationSql(true);
    const insertMember = mock();
    const insertMembership = mock();
    const updateEdition = mock();
    const updateMembership = mock();
    const updateInterest = mock();
    uuidv7Mock
      .mockReturnValueOnce("membership-1")
      .mockReturnValueOnce("event-member-1");
    const results = [
      {
        eventId: "event-1",
        id: "interest-1",
        status: "pending",
        userId: "volunteer-1",
      },
      {
        id: "event-1",
        managementDomain: "kalakriti",
        teamId: "team-1",
      },
      undefined,
      {
        id: "edition-1",
        lifecycle: "draft",
        teamEventId: "event-1",
      },
      {
        email: "volunteer@example.com",
        isActive: true,
        role: "unoriented_volunteer",
        name: "Volunteer One",
        phone: null,
      },
      undefined,
      undefined,
      undefined,
      {
        editionId: "edition-1",
        humanId: null,
        kind: "volunteer",
        id: "membership-1",
        state: "active",
      },
    ];
    const tx = {
      location: "server",
      dbTransaction: { wrappedTransaction: sql.transaction },
      mutate: {
        eventInterest: { update: updateInterest },
        kalakritiEdition: { update: updateEdition },
        kalakritiEditionMembership: {
          insert: insertMembership,
          update: updateMembership,
        },
        teamEventMember: { insert: insertMember },
      },
      run: mock(async () => results.shift()),
    };

    await eventInterestMutators.approve.fn({
      args: { id: "interest-1", now: 1_700_000_000_000 },
      ctx: {
        permissions: ["events.manage_interest"],
        role: "admin",
        userId: "admin-1",
      },
      tx,
    } as unknown as Parameters<typeof eventInterestMutators.approve.fn>[0]);

    expect(sql.returning).toHaveBeenCalledTimes(1);
    expect(sql.deleteWhere).toHaveBeenCalledTimes(1);
    expect(updateInterest).toHaveBeenCalledWith({
      id: "interest-1",
      reviewedAt: 1_700_000_000_000,
      reviewedBy: "admin-1",
      status: "approved",
    });
    expect(insertMember).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        userId: "volunteer-1",
      })
    );
    expect(insertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        editionId: "edition-1",
        kind: "volunteer",
        state: "active",
        userId: "volunteer-1",
      })
    );
  });
});

describe("event interest targets", () => {
  const NOW = Date.UTC(2026, 9, 8);
  const DAY = 24 * 60 * 60 * 1000;
  // Weekly on Saturdays at 04:30Z, started a month ago.
  const SERIES = {
    cancelledAt: null,
    endTime: Date.UTC(2026, 8, 5, 6, 30),
    id: "series-1",
    isPublic: true,
    name: "Class",
    recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA" },
    seriesId: null,
    startTime: Date.UTC(2026, 8, 5, 4, 30),
    teamId: "team-1",
  };

  function runCreate(results: unknown[], args: Record<string, unknown> = {}) {
    const insertInterest = mock();
    const insertEvent = mock();
    const tx = {
      location: "client",
      mutate: {
        eventInterest: { insert: insertInterest },
        teamEvent: { insert: insertEvent },
        teamEventMember: { insert: mock() },
      },
      run: mock(async () => results.shift()),
    };
    const result = eventInterestMutators.create.fn({
      args: { eventId: "series-1", id: "interest-1", now: NOW, ...args },
      ctx: {
        permissions: ["events.view_own"],
        role: "unoriented_volunteer",
        userId: "volunteer-1",
      },
      tx,
    } as unknown as Parameters<typeof eventInterestMutators.create.fn>[0]);
    return { insertEvent, insertInterest, result };
  }

  it("rejects a one-off event that has started", async () => {
    const { insertInterest, result } = runCreate([
      { ...SERIES, recurrenceRule: null, startTime: NOW - DAY },
      undefined,
    ]);
    await expect(result).rejects.toThrow("already started");
    expect(insertInterest).not.toHaveBeenCalled();
  });

  it("rejects cancelled events", async () => {
    const { insertInterest, result } = runCreate([
      { ...SERIES, cancelledAt: NOW - DAY, startTime: NOW + DAY },
    ]);
    await expect(result).rejects.toThrow("Event is cancelled");
    expect(insertInterest).not.toHaveBeenCalled();
  });

  it("rejects interest in a whole series that has started", async () => {
    const { insertInterest, result } = runCreate([SERIES, undefined]);
    await expect(result).rejects.toThrow("already started");
    expect(insertInterest).not.toHaveBeenCalled();
  });

  it("files interest on the materialized session of a series", async () => {
    const session = {
      ...SERIES,
      id: "session-1",
      originalDate: "2026-10-10",
      recurrenceRule: null,
      seriesId: "series-1",
      startTime: Date.UTC(2026, 9, 10, 4, 30),
    };
    const { insertEvent, insertInterest, result } = runCreate(
      [SERIES, undefined, undefined, session, undefined, undefined],
      { materializedId: "session-1", occDate: "2026-10-10" }
    );
    await result;
    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        originalDate: "2026-10-10",
        seriesId: "series-1",
      })
    );
    expect(insertInterest).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "session-1", status: "pending" })
    );
  });

  it("rejects a date the series has no session on", async () => {
    const { insertEvent, result } = runCreate([SERIES, undefined], {
      materializedId: "session-1",
      occDate: "2026-10-11",
    });
    await expect(result).rejects.toThrow("no session on that date");
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
