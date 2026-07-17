import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { assertEventNotManagedByKalakriti } from "../kalakriti-event-guard";
import { computeOccurrenceStart, teamEventMutators } from "../team-event";

const recurrenceRuleSchema = z
  .object({
    exdates: z.array(z.string()).optional(),
    rrule: z.string(),
  })
  .optional();

const createSchema = z.object({
  createWhatsAppGroup: z.boolean().optional(),
  description: z.string().optional(),
  endTime: z.number().optional(),
  feedbackDeadline: z.number().nullable().optional(),
  feedbackEnabled: z.boolean().optional(),
  id: z.string(),
  isPublic: z.boolean().optional(),
  location: z.string().optional(),
  name: z.string().min(1),
  now: z.number(),
  postRsvpPoll: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema,
  reminderIntervals: z.array(z.number()).nullable().optional(),
  startTime: z.number(),
  teamId: z.string(),
  whatsappGroupId: z.string().optional(),
});

const updateSchema = z.object({
  description: z.string().optional(),
  endTime: z.number().optional(),
  feedbackDeadline: z.number().nullable().optional(),
  feedbackEnabled: z.boolean().optional(),
  id: z.string(),
  isPublic: z.boolean().optional(),
  location: z.string().optional(),
  name: z.string().min(1).optional(),
  now: z.number(),
  postRsvpPoll: z.boolean().optional(),
  reminderIntervals: z.array(z.number()).nullable().optional(),
  startTime: z.number().optional(),
  whatsappGroupId: z.string().optional(),
});

const cancelSchema = z.object({
  id: z.string(),
  now: z.number(),
  reason: z.string().optional(),
});

const addMemberSchema = z.object({
  eventId: z.string(),
  id: z.string(),
  now: z.number(),
  userId: z.string(),
});

const addMembersSchema = z.object({
  eventId: z.string(),
  members: z.array(z.object({ id: z.string(), userId: z.string() })).min(1),
  now: z.number(),
});

const removeMemberSchema = z.object({
  eventId: z.string(),
  memberId: z.string(),
});

const leaveEventSchema = z.object({
  eventId: z.string(),
  now: z.number(),
});

const joinAsMemberSchema = z.object({
  eventId: z.string(),
  id: z.string(),
  materializedId: z.string().optional(),
  now: z.number(),
  occDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const materializeSchema = z.object({
  id: z.string(),
  now: z.number(),
  originalDate: z.string(),
  seriesId: z.string(),
});

const updateSeriesSchema = z.object({
  description: z.string().optional(),
  endTime: z.number().optional(),
  feedbackDeadline: z.number().nullable().optional(),
  feedbackEnabled: z.boolean().optional(),
  id: z.string(),
  isPublic: z.boolean().optional(),
  location: z.string().optional(),
  mode: z.enum(["this", "following", "all"]),
  name: z.string().min(1).optional(),
  newExceptionId: z.string().optional(),
  newSeriesId: z.string().optional(),
  now: z.number(),
  originalDate: z.string().optional(),
  postRsvpPoll: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema,
  reminderIntervals: z.array(z.number()).nullable().optional(),
  startTime: z.number().optional(),
  whatsappGroupId: z.string().optional(),
});

const cancelSeriesSchema = z.object({
  id: z.string(),
  mode: z.enum(["this", "following", "all"]),
  newExceptionId: z.string().optional(),
  now: z.number(),
  originalDate: z.string().optional(),
  reason: z.string().optional(),
});

describe("assertEventNotManagedByKalakriti", () => {
  it("allows ordinary team events", async () => {
    const tx = { run: async () => undefined };

    await expect(
      assertEventNotManagedByKalakriti(tx, "event-1")
    ).resolves.toBeUndefined();
  });

  it("rejects events linked to a Kalakriti Edition", async () => {
    const tx = {
      run: async () => ({ id: "event-1", managementDomain: "kalakriti" }),
    };

    await expect(
      assertEventNotManagedByKalakriti(tx, "event-1")
    ).rejects.toThrow("Manage this event from Kalakriti");
  });
});

function makeProtectedEventTx() {
  const event = {
    id: "event-1",
    managementDomain: "kalakriti",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    teamId: "team-1",
  };
  return {
    location: "server",
    mutate: {},
    run: vi.fn(async () => event),
  };
}

const protectedEventContext = {
  permissions: [
    "events.edit",
    "events.manage_attendance",
    "events.manage_members",
  ],
  role: "admin",
  userId: "admin-1",
};

describe("linked Kalakriti event mutators", () => {
  const protectedCommands = [
    [
      "bulk member management",
      teamEventMutators.addMembers,
      {
        eventId: "event-1",
        members: [{ id: "member-1", userId: "volunteer-1" }],
        now: 1_700_000_000_000,
      },
    ],
    [
      "cancellation",
      teamEventMutators.cancel,
      { id: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "series cancellation",
      teamEventMutators.cancelSeries,
      { id: "event-1", mode: "all", now: 1_700_000_000_000 },
    ],
    [
      "self join",
      teamEventMutators.joinAsMember,
      {
        eventId: "event-1",
        id: "member-1",
        now: 1_700_000_000_000,
      },
    ],
    [
      "self leave",
      teamEventMutators.leaveEvent,
      { eventId: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "bulk attendance",
      teamEventMutators.markAllPresent,
      { eventId: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "member removal",
      teamEventMutators.removeMember,
      { eventId: "event-1", memberId: "member-1" },
    ],
    [
      "series updates",
      teamEventMutators.updateSeries,
      { id: "event-1", mode: "all", now: 1_700_000_000_000 },
    ],
    [
      "occurrence materialization",
      teamEventMutators.materialize,
      {
        id: "exception-1",
        now: 1_700_000_000_000,
        originalDate: "2028-11-19",
        seriesId: "event-1",
      },
    ],
  ] as const;

  it.each(protectedCommands)(
    "rejects direct %s",
    async (_name, mutator, args) => {
      await expect(
        mutator.fn({
          args,
          ctx: protectedEventContext,
          tx: makeProtectedEventTx(),
        } as never)
      ).rejects.toThrow("Manage this event from Kalakriti");
    }
  );

  it("rejects direct member management", async () => {
    await expect(
      teamEventMutators.addMember.fn({
        args: {
          eventId: "event-1",
          id: "member-1",
          now: 1_700_000_000_000,
          userId: "volunteer-1",
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.addMember.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });

  it("rejects direct attendance management", async () => {
    await expect(
      teamEventMutators.markAttendance.fn({
        args: {
          attendance: "present",
          eventId: "event-1",
          memberId: "member-1",
          now: 1_700_000_000_000,
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.markAttendance.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });

  it("rejects direct core event updates", async () => {
    await expect(
      teamEventMutators.update.fn({
        args: {
          id: "event-1",
          name: "Changed outside Kalakriti",
          now: 1_700_000_000_000,
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.update.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });
});

describe("teamEvent mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        description: "Standup",
        endTime: 1_700_003_600_000,
        id: "evt-1",
        isPublic: true,
        location: "Office",
        name: "Weekly meeting",
        now: 1_700_000_000_000,
        recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=MO" },
        startTime: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Meeting",
        now: 1_700_000_000_000,
        startTime: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "",
        now: 1_700_000_000_000,
        startTime: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing teamId", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Meeting",
        now: 1_700_000_000_000,
        startTime: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing startTime", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Meeting",
        now: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid recurrence rule with endDate", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Recurring",
        now: 1_700_000_000_000,
        recurrenceRule: { rrule: "FREQ=MONTHLY;BYDAY=1SA;UNTIL=20261231" },
        startTime: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid recurrence rule", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Recurring",
        now: 1_700_000_000_000,
        recurrenceRule: { rrule: 123 },
        startTime: 1_700_000_000_000,
        teamId: "team-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update", () => {
    it("accepts valid update with partial fields", () => {
      const result = updateSchema.safeParse({
        id: "evt-1",
        name: "Updated meeting",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts update with only id and now", () => {
      const result = updateSchema.safeParse({
        id: "evt-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name when provided", () => {
      const result = updateSchema.safeParse({
        id: "evt-1",
        name: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = updateSchema.safeParse({
        id: "evt-1",
        name: "Updated",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("cancel", () => {
    it("accepts valid input", () => {
      const result = cancelSchema.safeParse({
        id: "evt-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = cancelSchema.safeParse({ now: 1_700_000_000_000 });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = cancelSchema.safeParse({ id: "evt-1" });
      expect(result.success).toBe(false);
    });
  });

  describe("addMember", () => {
    it("accepts valid input", () => {
      const result = addMemberSchema.safeParse({
        eventId: "evt-1",
        id: "mem-1",
        now: 1_700_000_000_000,
        userId: "user-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing eventId", () => {
      const result = addMemberSchema.safeParse({
        id: "mem-1",
        now: 1_700_000_000_000,
        userId: "user-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("addMembers", () => {
    it("accepts valid input with multiple members", () => {
      const result = addMembersSchema.safeParse({
        eventId: "evt-1",
        members: [
          { id: "m-1", userId: "u-1" },
          { id: "m-2", userId: "u-2" },
        ],
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty members array", () => {
      const result = addMembersSchema.safeParse({
        eventId: "evt-1",
        members: [],
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("removeMember", () => {
    it("accepts valid input", () => {
      const result = removeMemberSchema.safeParse({
        eventId: "evt-1",
        memberId: "mem-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing memberId", () => {
      const result = removeMemberSchema.safeParse({
        eventId: "evt-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("leaveEvent", () => {
    it("accepts valid input", () => {
      const result = leaveEventSchema.safeParse({
        eventId: "evt-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing eventId", () => {
      const result = leaveEventSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = leaveEventSchema.safeParse({
        eventId: "evt-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("joinAsMember", () => {
    it("accepts valid input", () => {
      const result = joinAsMemberSchema.safeParse({
        eventId: "evt-1",
        id: "mem-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts virtual-occurrence input with occDate + materializedId", () => {
      const result = joinAsMemberSchema.safeParse({
        eventId: "series-1",
        id: "mem-1",
        materializedId: "evt-2",
        now: 1_700_000_000_000,
        occDate: "2026-05-02",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid occDate format", () => {
      const result = joinAsMemberSchema.safeParse({
        eventId: "series-1",
        id: "mem-1",
        materializedId: "evt-2",
        now: 1_700_000_000_000,
        occDate: "05/02/2026",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = joinAsMemberSchema.safeParse({
        id: "mem-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = joinAsMemberSchema.safeParse({
        eventId: "evt-1",
        id: "mem-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("materialize", () => {
    it("accepts valid input", () => {
      const result = materializeSchema.safeParse({
        id: "exc-1",
        now: 1_700_000_000_000,
        originalDate: "2026-04-12",
        seriesId: "evt-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing originalDate", () => {
      const result = materializeSchema.safeParse({
        id: "exc-1",
        now: 1_700_000_000_000,
        seriesId: "evt-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("computeOccurrenceStart", () => {
    it("returns occurrence date at series wall-clock time", () => {
      const seriesStart = new Date(2026, 0, 1, 10, 30, 0, 0).getTime();
      const result = computeOccurrenceStart(seriesStart, "2026-01-15");
      const resultDate = new Date(result);
      expect(resultDate.getFullYear()).toBe(2026);
      expect(resultDate.getMonth()).toBe(0);
      expect(resultDate.getDate()).toBe(15);
      expect(resultDate.getHours()).toBe(10);
      expect(resultDate.getMinutes()).toBe(30);
    });

    it("does not return the series parent's startTime", () => {
      const seriesStart = new Date(2026, 0, 1, 10, 0, 0, 0).getTime();
      const result = computeOccurrenceStart(seriesStart, "2026-01-15");
      expect(result).not.toBe(seriesStart);
      expect(result).toBeGreaterThan(seriesStart);
    });
  });

  describe("updateSeries", () => {
    it("accepts 'all' mode with recurrence update", () => {
      const result = updateSeriesSchema.safeParse({
        id: "evt-1",
        mode: "all",
        name: "Updated name",
        now: 1_700_000_000_000,
        recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=MO,WE" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts 'this' mode with originalDate", () => {
      const result = updateSeriesSchema.safeParse({
        id: "evt-1",
        mode: "this",
        name: "Special session",
        newExceptionId: "exc-1",
        now: 1_700_000_000_000,
        originalDate: "2026-04-12",
      });
      expect(result.success).toBe(true);
    });

    it("accepts 'following' mode with new series ID", () => {
      const result = updateSeriesSchema.safeParse({
        id: "evt-1",
        mode: "following",
        name: "New series name",
        newSeriesId: "series-2",
        now: 1_700_000_000_000,
        originalDate: "2026-04-19",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid mode", () => {
      const result = updateSeriesSchema.safeParse({
        id: "evt-1",
        mode: "invalid",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("cancelSeries", () => {
    it("accepts 'all' mode", () => {
      const result = cancelSeriesSchema.safeParse({
        id: "evt-1",
        mode: "all",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts 'this' mode with originalDate", () => {
      const result = cancelSeriesSchema.safeParse({
        id: "evt-1",
        mode: "this",
        newExceptionId: "exc-1",
        now: 1_700_000_000_000,
        originalDate: "2026-04-12",
      });
      expect(result.success).toBe(true);
    });

    it("accepts 'following' mode", () => {
      const result = cancelSeriesSchema.safeParse({
        id: "evt-1",
        mode: "following",
        now: 1_700_000_000_000,
        originalDate: "2026-04-19",
      });
      expect(result.success).toBe(true);
    });
  });
});
