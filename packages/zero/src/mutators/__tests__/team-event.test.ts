import { describe, expect, it } from "vitest";
import z from "zod";

const recurrenceRuleSchema = z
  .object({
    rrule: z.string(),
    exdates: z.array(z.string()).optional(),
  })
  .optional();

const createSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  isPublic: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema,
  whatsappGroupId: z.string().optional(),
  createWhatsAppGroup: z.boolean().optional(),
  now: z.number(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  now: z.number(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  isPublic: z.boolean().optional(),
  whatsappGroupId: z.string().optional(),
});

const cancelSchema = z.object({ id: z.string(), now: z.number() });

const addMemberSchema = z.object({
  id: z.string(),
  eventId: z.string(),
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

describe("teamEvent mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "Weekly meeting",
        description: "Standup",
        location: "Office",
        startTime: 1_700_000_000_000,
        endTime: 1_700_003_600_000,
        isPublic: true,
        recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=MO" },
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "Meeting",
        startTime: 1_700_000_000_000,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "",
        startTime: 1_700_000_000_000,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing teamId", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        name: "Meeting",
        startTime: 1_700_000_000_000,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing startTime", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "Meeting",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid recurrence rule with endDate", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "Recurring",
        startTime: 1_700_000_000_000,
        recurrenceRule: { rrule: "FREQ=MONTHLY;BYDAY=1SA;UNTIL=20261231" },
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid recurrence rule", () => {
      const result = createSchema.safeParse({
        id: "evt-1",
        teamId: "team-1",
        name: "Recurring",
        startTime: 1_700_000_000_000,
        recurrenceRule: { rrule: 123 },
        now: 1_700_000_000_000,
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
        id: "mem-1",
        eventId: "evt-1",
        userId: "user-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing eventId", () => {
      const result = addMemberSchema.safeParse({
        id: "mem-1",
        userId: "user-1",
        now: 1_700_000_000_000,
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
});
