import { describe, expect, it, vi } from "vitest";
import {
  kalakritiEditionCreateSchema,
  kalakritiEditionMutators,
} from "../kalakriti-edition";

const validArgs = {
  ageCutoffDate: "2028-06-01",
  auditEntryId: "audit-1",
  brandingKey: "kalakriti-2028",
  editionId: "edition-1",
  eventDate: "2028-11-19",
  name: "Kalakriti 2028",
  now: 1_700_000_000_000,
  plannedRegistrationCloseAt: new Date("2028-10-31T23:45:00+05:30").getTime(),
  teamEventId: "event-1",
  teamId: "team-1",
  year: 2028,
};

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};

describe("kalakritiEdition.create", () => {
  it("rejects non-admin callers before reading or writing data", async () => {
    const run = vi.fn();
    const insertEvent = vi.fn();
    const tx = {
      location: "server",
      mutate: { teamEvent: { insert: insertEvent } },
      run,
    };

    await expect(
      kalakritiEditionMutators.create.fn({
        args: validArgs,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "external_user",
          userId: "guardian-1",
        },
        tx,
      } as unknown as Parameters<typeof kalakritiEditionMutators.create.fn>[0])
    ).rejects.toThrow("Unauthorized");
    expect(run).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects impossible calendar dates at the command boundary", () => {
    expect(
      kalakritiEditionCreateSchema.safeParse({
        ...validArgs,
        eventDate: "2028-02-31",
      }).success
    ).toBe(false);
  });

  it("rejects duplicate years before inserting a linked event", async () => {
    const insertEvent = vi.fn();
    const tx = {
      location: "server",
      mutate: { teamEvent: { insert: insertEvent } },
      run: vi.fn(async () => ({ id: "existing-edition" })),
    };

    await expect(
      kalakritiEditionMutators.create.fn({
        args: validArgs,
        ctx: adminContext,
        tx,
      } as unknown as Parameters<typeof kalakritiEditionMutators.create.fn>[0])
    ).rejects.toThrow("Kalakriti 2028 already exists");
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects an unknown owning team before inserting records", async () => {
    const insertEvent = vi.fn();
    const insertEdition = vi.fn();
    const insertAudit = vi.fn();
    const results = [undefined, undefined];
    const tx = {
      location: "server",
      mutate: {
        kalakritiAuditEntry: { insert: insertAudit },
        kalakritiEdition: { insert: insertEdition },
        teamEvent: { insert: insertEvent },
      },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      kalakritiEditionMutators.create.fn({
        args: validArgs,
        ctx: adminContext,
        tx,
      } as unknown as Parameters<typeof kalakritiEditionMutators.create.fn>[0])
    ).rejects.toThrow("Owning team not found");
    expect(insertEvent).not.toHaveBeenCalled();
    expect(insertEdition).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("rejects registration closing at or after the event starts", async () => {
    const insertEvent = vi.fn();
    const insertEdition = vi.fn();
    const insertAudit = vi.fn();
    const results = [undefined, { id: "team-1" }];
    const tx = {
      location: "server",
      mutate: {
        kalakritiAuditEntry: { insert: insertAudit },
        kalakritiEdition: { insert: insertEdition },
        teamEvent: { insert: insertEvent },
      },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      kalakritiEditionMutators.create.fn({
        args: {
          ...validArgs,
          plannedRegistrationCloseAt: new Date(
            "2028-11-19T00:00:00+05:30"
          ).getTime(),
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<typeof kalakritiEditionMutators.create.fn>[0])
    ).rejects.toThrow("Registration must close before the event date");
    expect(insertEvent).not.toHaveBeenCalled();
    expect(insertEdition).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("creates no implicit yearly assignment for the global administrator", async () => {
    const insertAudit = vi.fn();
    const insertEdition = vi.fn();
    const insertEvent = vi.fn();
    const results = [undefined, { id: "team-1" }];
    const tx = {
      location: "server",
      mutate: {
        kalakritiAuditEntry: { insert: insertAudit },
        kalakritiEdition: { insert: insertEdition },
        teamEvent: { insert: insertEvent },
      },
      run: vi.fn(async () => results.shift()),
    };

    await kalakritiEditionMutators.create.fn({
      args: validArgs,
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiEditionMutators.create.fn>[0]);

    expect(insertEvent).toHaveBeenCalledOnce();
    expect(insertEdition).toHaveBeenCalledOnce();
    expect(insertAudit).toHaveBeenCalledOnce();
  });
});
