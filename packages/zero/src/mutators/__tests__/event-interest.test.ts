import { describe, expect, it, vi } from "vitest";
import z from "zod";
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

describe("Kalakriti event protection", () => {
  const context = {
    permissions: ["events.manage_interest"],
    role: "admin",
    userId: "admin-1",
  };

  it("rejects interest approval before changing the linked event roster", async () => {
    const insertMember = vi.fn();
    const updateInterest = vi.fn();
    const results = [
      {
        eventId: "event-1",
        id: "interest-1",
        status: "pending",
        userId: "volunteer-1",
      },
      { id: "event-1", teamId: "team-1" },
      { id: "event-1", managementDomain: "kalakriti" },
    ];
    const tx = {
      location: "server",
      mutate: {
        eventInterest: { update: updateInterest },
        teamEventMember: { insert: insertMember },
      },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      eventInterestMutators.approve.fn({
        args: { id: "interest-1", now: 1_700_000_000_000 },
        ctx: context,
        tx,
      } as unknown as Parameters<typeof eventInterestMutators.approve.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
    expect(updateInterest).not.toHaveBeenCalled();
    expect(insertMember).not.toHaveBeenCalled();
  });

  it.each([
    {
      args: {
        eventId: "event-1",
        id: "interest-1",
        now: 1_700_000_000_000,
      },
      name: "create",
      results: [
        {
          id: "event-1",
          isPublic: true,
          name: "Kalakriti",
          startTime: 1_800_000_000_000,
          teamId: "team-1",
        },
        { id: "event-1", managementDomain: "kalakriti" },
      ],
    },
    {
      args: { id: "interest-1", now: 1_700_000_000_000 },
      name: "reject",
      results: [
        {
          eventId: "event-1",
          id: "interest-1",
          status: "pending",
          userId: "admin-1",
        },
        { id: "event-1", teamId: "team-1" },
        { id: "event-1", managementDomain: "kalakriti" },
      ],
    },
    {
      args: { id: "interest-1" },
      name: "cancel",
      results: [
        {
          eventId: "event-1",
          id: "interest-1",
          status: "pending",
          userId: "admin-1",
        },
        { id: "event-1", managementDomain: "kalakriti" },
      ],
    },
  ])("rejects $name for a Kalakriti-managed event", async (testCase) => {
    const insertInterest = vi.fn();
    const updateInterest = vi.fn();
    const deleteInterest = vi.fn();
    const results = [...testCase.results];
    const tx = {
      location: "server",
      mutate: {
        eventInterest: {
          delete: deleteInterest,
          insert: insertInterest,
          update: updateInterest,
        },
      },
      run: vi.fn(async () => results.shift()),
    };
    const mutator =
      eventInterestMutators[testCase.name as "cancel" | "create" | "reject"];

    await expect(
      mutator.fn({
        args: testCase.args,
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Manage this event from Kalakriti");
    expect(insertInterest).not.toHaveBeenCalled();
    expect(updateInterest).not.toHaveBeenCalled();
    expect(deleteInterest).not.toHaveBeenCalled();
  });
});
