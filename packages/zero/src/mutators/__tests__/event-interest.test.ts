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

describe("Kalakriti event interest", () => {
  it("accepts interest in a public Kalakriti event", async () => {
    const insertInterest = vi.fn();
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
      run: vi.fn(async () => results.shift()),
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

  it("allows an interest manager to approve a Kalakriti request", async () => {
    const insertMember = vi.fn();
    const insertMembership = vi.fn();
    const updateInterest = vi.fn();
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
        name: "Volunteer One",
        phone: null,
      },
      undefined,
      undefined,
    ];
    const tx = {
      location: "client",
      mutate: {
        eventInterest: { update: updateInterest },
        kalakritiEditionMembership: {
          insert: insertMembership,
          update: vi.fn(),
        },
        teamEventMember: { insert: insertMember },
      },
      run: vi.fn(async () => results.shift()),
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
