import { describe, expect, it, vi } from "vitest";
import { getKalakritiRegistrationReadiness } from "../../kalakriti-registration-readiness";
import {
  kalakritiEditionCloneConfigurationSchema,
  kalakritiEditionCreateSchema,
  kalakritiEditionMutators,
  kalakritiEditionTransitionSchema,
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

describe("Kalakriti Edition registration readiness", () => {
  const readySnapshot = {
    ageCategories: [{ id: "age-1", maximumAge: 12, minimumAge: 8 }],
    centers: [{ id: "center-1", retiredAt: null }],
    competitionCategories: [{ id: "category-1", retiredAt: null }],
    competitions: [
      {
        cancelledAt: null,
        competitionCategoryId: "category-1",
        editionId: "edition-1",
        id: "competition-1",
        retiredAt: null,
      },
    ],
    edition: {
      ageCutoffDate: Date.UTC(2028, 5, 1),
      eventDate: Date.UTC(2028, 10, 19),
      plannedRegistrationCloseAt: Date.UTC(2028, 9, 31),
      timezone: "Asia/Kolkata",
    },
    quotas: [{ ageCategoryId: "age-1", centerId: "center-1" }],
    sessions: [
      {
        ageCategoryId: "age-1",
        cancelledAt: null,
        capacity: 10,
        competitionId: "competition-1",
        endAt: new Date("2028-11-19T11:00:00+05:30").getTime(),
        id: "session-1",
        startAt: new Date("2028-11-19T10:00:00+05:30").getTime(),
        venueId: "venue-1",
      },
    ],
    venues: [{ id: "venue-1", retiredAt: null }],
  };

  it("returns stable blockers for a missing quota and invalid Session", () => {
    const session = readySnapshot.sessions.at(0);
    if (!session) {
      throw new Error("Ready snapshot requires a Session");
    }
    expect(
      getKalakritiRegistrationReadiness({
        ...readySnapshot,
        quotas: [],
        sessions: [{ ...session, capacity: 0 }],
      }).map((blocker) => blocker.code)
    ).toEqual(["missing_center_age_quotas", "invalid_active_sessions"]);
  });

  it("requires explicit confirmation for lifecycle and clone commands", () => {
    expect(
      kalakritiEditionTransitionSchema.safeParse({
        auditEntryId: "audit",
        editionId: "edition-1",
        now: 1,
        targetLifecycle: "registration_open",
      }).success
    ).toBe(false);
    expect(
      kalakritiEditionCloneConfigurationSchema.safeParse({
        ageCategoryIds: [],
        auditEntryId: "audit",
        competitionCategoryIds: [],
        competitionIds: [],
        now: 1,
        sourceEditionId: "source",
        targetEditionId: "target",
        venueIds: [],
      }).success
    ).toBe(false);
  });

  it("rejects a clone source with no active structural configuration", async () => {
    const insertAudit = vi.fn();
    const edition = {
      eventDate: "2028-11-19",
      id: "edition",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const results = [
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      { ...edition, id: "target" },
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ];
    const tx = {
      location: "client",
      mutate: {
        kalakritiAgeCategory: { insert: vi.fn() },
        kalakritiAuditEntry: { insert: insertAudit },
        kalakritiCompetition: { insert: vi.fn() },
        kalakritiCompetitionCategory: { insert: vi.fn() },
        kalakritiEdition: { insert: vi.fn(), update: vi.fn() },
        kalakritiVenue: { insert: vi.fn() },
        teamEvent: { insert: vi.fn() },
      },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      kalakritiEditionMutators.cloneConfiguration.fn({
        args: {
          ageCategoryIds: [],
          auditEntryId: "audit",
          competitionCategoryIds: [],
          competitionIds: [],
          confirmed: true,
          now: 1,
          sourceEditionId: "source",
          targetEditionId: "target",
          venueIds: [],
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiEditionMutators.cloneConfiguration.fn
      >[0])
    ).rejects.toThrow("Source Edition has no active structural configuration");
    expect(insertAudit).not.toHaveBeenCalled();
  });
});
