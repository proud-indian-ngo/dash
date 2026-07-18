import { describe, expect, it, vi } from "vitest";
import {
  kalakritiCompetitionCreateSchema,
  kalakritiCompetitionMutators,
} from "../kalakriti-competition";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};

const edition = {
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "draft",
  timezone: "Asia/Kolkata",
};
const category = {
  editionId: "edition-1",
  id: "category-1",
  name: "Cultural",
  retiredAt: null,
};
const competition = {
  cancelledAt: null,
  competitionCategoryId: category.id,
  editionId: edition.id,
  genderEligibility: "both" as const,
  id: "competition-1",
  maximumGroupSize: 1,
  minimumGroupSize: 1,
  name: "Dance",
  participationMode: "individual" as const,
  retiredAt: null,
};
const venue = {
  editionId: edition.id,
  id: "venue-1",
  name: "Main Hall",
  retiredAt: null,
};

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    deleteCategory: vi.fn(),
    deleteCompetition: vi.fn(),
    deleteSession: vi.fn(),
    deleteVenue: vi.fn(),
    insertAudit: vi.fn(),
    insertCategory: vi.fn(),
    insertCompetition: vi.fn(),
    insertSession: vi.fn(),
    insertVenue: vi.fn(),
    updateCategory: vi.fn(),
    updateCompetition: vi.fn(),
    updateSession: vi.fn(),
    updateVenue: vi.fn(),
  };
  const select = vi.fn(() => {
    const query = {
      for: vi.fn(() => lockedResults.shift() ?? []),
      from: vi.fn(),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  });
  return {
    lockedResults,
    spies,
    tx: {
      dbTransaction: { wrappedTransaction: { select } },
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiCompetition: {
          delete: spies.deleteCompetition,
          insert: spies.insertCompetition,
          update: spies.updateCompetition,
        },
        kalakritiCompetitionCategory: {
          delete: spies.deleteCategory,
          insert: spies.insertCategory,
          update: spies.updateCategory,
        },
        kalakritiCompetitionSession: {
          delete: spies.deleteSession,
          insert: spies.insertSession,
          update: spies.updateSession,
        },
        kalakritiVenue: {
          delete: spies.deleteVenue,
          insert: spies.insertVenue,
          update: spies.updateVenue,
        },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

describe("kalakritiCompetition commands", () => {
  it("allows the Overall Events Lead to create a normalized Category", async () => {
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1" },
      { id: "assignment-1" },
    ]);
    lockedResults.push([edition]);

    await kalakritiCompetitionMutators.createCategory.fn({
      args: {
        auditEntryId: "audit-1",
        categoryId: "category-1",
        editionId: edition.id,
        name: "  Cultural   Events ",
        now: 1,
        sortOrder: 0,
      },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "lead-1",
      },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.createCategory.fn
    >[0]);

    expect(spies.insertCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Cultural Events",
        normalizedName: "cultural events",
      })
    );
  });

  it("rejects structural Competition configuration after registration is locked", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([{ ...edition, lifecycle: "registration_locked" }]);

    await expect(
      kalakritiCompetitionMutators.createCategory.fn({
        args: {
          auditEntryId: "audit-1",
          categoryId: "category-2",
          editionId: edition.id,
          name: "Theatre",
          now: 1,
          sortOrder: 1,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.createCategory.fn
      >[0])
    ).rejects.toThrow("Structural configuration");
    expect(spies.insertCategory).not.toHaveBeenCalled();
  });

  it("keeps a Category Lead read-only", async () => {
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1" },
      undefined,
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.createCategory.fn({
        args: {
          auditEntryId: "audit-1",
          categoryId: "category-1",
          editionId: edition.id,
          name: "Cultural",
          now: 1,
          sortOrder: 0,
        },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "category-lead-1",
        },
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.createCategory.fn
      >[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertCategory).not.toHaveBeenCalled();
  });

  it("rejects invalid individual and group size rules at the boundary", () => {
    const base = {
      auditEntryId: "audit-1",
      competitionCategoryId: category.id,
      competitionId: competition.id,
      editionId: edition.id,
      genderEligibility: "both" as const,
      name: "Dance",
      now: 1,
    };
    expect(
      kalakritiCompetitionCreateSchema.safeParse({
        ...base,
        maximumGroupSize: 2,
        minimumGroupSize: 1,
        participationMode: "individual",
      }).success
    ).toBe(false);
    expect(
      kalakritiCompetitionCreateSchema.safeParse({
        ...base,
        maximumGroupSize: 2,
        minimumGroupSize: 1,
        participationMode: "group",
      }).success
    ).toBe(false);
  });

  it("rejects a Competition Category from another Edition", async () => {
    const { lockedResults, spies, tx } = createTx([
      { ...category, editionId: "edition-2" },
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.createCompetition.fn({
        args: {
          auditEntryId: "audit-1",
          competitionCategoryId: category.id,
          competitionId: competition.id,
          editionId: edition.id,
          genderEligibility: "both",
          maximumGroupSize: 1,
          minimumGroupSize: 1,
          name: "Dance",
          now: 1,
          participationMode: "individual",
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.createCompetition.fn
      >[0])
    ).rejects.toThrow("not found in this Edition");
    expect(spies.insertCompetition).not.toHaveBeenCalled();
  });

  it("creates a same-day Session in an active Venue", async () => {
    const { lockedResults, spies, tx } = createTx([
      competition,
      { editionId: edition.id, id: "age-1" },
      venue,
      [],
    ]);
    lockedResults.push([edition]);

    await kalakritiCompetitionMutators.createSession.fn({
      args: {
        ageCategoryId: "age-1",
        auditEntryId: "audit-1",
        capacity: 20,
        competitionId: competition.id,
        editionId: edition.id,
        endAt: Date.parse("2027-11-21T05:30:00.000Z"),
        now: 1,
        sessionId: "session-1",
        startAt: Date.parse("2027-11-21T04:30:00.000Z"),
        venueId: venue.id,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.createSession.fn
    >[0]);

    expect(spies.insertSession).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 20, id: "session-1" })
    );
  });

  it("notifies Competition staff when a published Session is created", async () => {
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, tx } = createTx([
      competition,
      { editionId: edition.id, id: "age-1" },
      venue,
      [],
    ]);
    lockedResults.push([{ ...edition, lifecycle: "registration_open" }]);

    await kalakritiCompetitionMutators.createSession.fn({
      args: {
        ageCategoryId: "age-1",
        auditEntryId: "session-create-audit",
        capacity: 20,
        competitionId: competition.id,
        editionId: edition.id,
        endAt: Date.parse("2027-11-21T05:30:00.000Z"),
        now: 1,
        sessionId: "session-1",
        startAt: Date.parse("2027-11-21T04:30:00.000Z"),
        venueId: venue.id,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.createSession.fn
    >[0]);

    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: [],
        competitionIds: [competition.id],
        revision: "session-create-audit",
      })
    );
  });

  it("rejects stale structural Session changes after registration is locked", async () => {
    const session = {
      ageCategoryId: "age-1",
      cancelledAt: null,
      capacity: 20,
      competitionId: competition.id,
      editionId: edition.id,
      endAt: Date.parse("2027-11-21T05:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: venue.id,
    };
    const { lockedResults, spies, tx } = createTx([session]);
    lockedResults.push([{ ...edition, lifecycle: "registration_locked" }]);

    await expect(
      kalakritiCompetitionMutators.updateSession.fn({
        args: {
          ...session,
          auditEntryId: "audit-1",
          capacity: 25,
          now: 1,
          sessionId: session.id,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.updateSession.fn
      >[0])
    ).rejects.toThrow("Only Session time and Venue");
    expect(spies.updateSession).not.toHaveBeenCalled();
  });

  it("allows Session time and Venue changes after registration is locked", async () => {
    const session = {
      ageCategoryId: "age-1",
      cancelledAt: null,
      capacity: 20,
      competitionId: competition.id,
      editionId: edition.id,
      endAt: Date.parse("2027-11-21T05:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: venue.id,
    };
    const nextVenue = { ...venue, id: "venue-2", name: "Second Hall" };
    const nextStartAt = Date.parse("2027-11-21T06:30:00.000Z");
    const nextEndAt = Date.parse("2027-11-21T07:30:00.000Z");
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, spies, tx } = createTx([
      session,
      [],
      competition,
      { editionId: edition.id, id: "age-1" },
      nextVenue,
      [],
      [{ centerId: "center-1" }, { centerId: "center-1" }],
    ]);
    lockedResults.push([{ ...edition, lifecycle: "registration_locked" }]);

    await kalakritiCompetitionMutators.updateSession.fn({
      args: {
        ...session,
        auditEntryId: "audit-1",
        endAt: nextEndAt,
        now: 1,
        sessionId: session.id,
        startAt: nextStartAt,
        venueId: nextVenue.id,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.updateSession.fn
    >[0]);

    expect(spies.updateSession).toHaveBeenCalledWith({
      ageCategoryId: session.ageCategoryId,
      capacity: session.capacity,
      competitionId: session.competitionId,
      endAt: nextEndAt,
      id: session.id,
      startAt: nextStartAt,
      updatedAt: 1,
      venueId: nextVenue.id,
    });
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "updated",
        targetId: session.id,
        targetType: "competition_session",
      })
    );
    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: ["center-1"],
        competitionIds: [competition.id],
        editionId: edition.id,
        revision: "audit-1",
      })
    );
  });

  it("allows Competition cancellation after registration is locked", async () => {
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, spies, tx } = createTx([competition, []]);
    lockedResults.push([{ ...edition, lifecycle: "registration_locked" }]);

    await kalakritiCompetitionMutators.setCompetitionCancelled.fn({
      args: {
        auditEntryId: "audit-1",
        enabled: true,
        id: competition.id,
        now: 1,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.setCompetitionCancelled.fn
    >[0]);

    expect(spies.updateCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ cancelledAt: 1, id: competition.id })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancelled",
        metadata: {
          competitionCategoryId: competition.competitionCategoryId,
        },
      })
    );
    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        competitionIds: [competition.id],
        revision: "audit-1",
      })
    );
  });

  it("notifies affected users when a published Session is cancelled", async () => {
    const session = {
      ageCategoryId: "age-1",
      cancelledAt: null,
      capacity: 20,
      competitionId: competition.id,
      editionId: edition.id,
      endAt: Date.parse("2027-11-21T05:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: venue.id,
    };
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, spies, tx } = createTx([
      session,
      [{ centerId: "center-1" }],
      competition,
    ]);
    lockedResults.push([{ ...edition, lifecycle: "registration_locked" }]);

    await kalakritiCompetitionMutators.setSessionCancelled.fn({
      args: {
        auditEntryId: "session-cancel-audit",
        enabled: true,
        id: session.id,
        now: 2,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.setSessionCancelled.fn
    >[0]);

    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: ["center-1"],
        competitionIds: [competition.id],
        revision: "session-cancel-audit",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancelled",
        domain: "schedule_configuration",
        metadata: {
          competitionCategoryId: competition.competitionCategoryId,
          competitionId: competition.id,
        },
      })
    );
  });

  it("notifies Competition staff when a published empty Session is deleted", async () => {
    const session = {
      competitionId: competition.id,
      editionId: edition.id,
      id: "session-1",
    };
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, tx } = createTx([session, undefined]);
    lockedResults.push([{ ...edition, lifecycle: "registration_open" }]);

    await kalakritiCompetitionMutators.deleteSession.fn({
      args: {
        auditEntryId: "session-delete-audit",
        id: session.id,
        now: 2,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.deleteSession.fn
    >[0]);

    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: [],
        competitionIds: [competition.id],
        revision: "session-delete-audit",
      })
    );
  });

  it("notifies affected users when a published Competition name changes", async () => {
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, tx } = createTx([
      competition,
      category,
      [{ centerId: "center-1" }, { centerId: "center-1" }],
    ]);
    lockedResults.push([{ ...edition, lifecycle: "registration_open" }]);

    await kalakritiCompetitionMutators.updateCompetition.fn({
      args: {
        auditEntryId: "competition-name-audit",
        competitionCategoryId: competition.competitionCategoryId,
        competitionId: competition.id,
        genderEligibility: competition.genderEligibility,
        maximumGroupSize: competition.maximumGroupSize,
        minimumGroupSize: competition.minimumGroupSize,
        name: "Dance Finals",
        now: 2,
        participationMode: competition.participationMode,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.updateCompetition.fn
    >[0]);

    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: ["center-1"],
        competitionIds: [competition.id],
        editionId: edition.id,
        revision: "competition-name-audit",
      })
    );
  });

  it("notifies affected users when a published Venue name changes", async () => {
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const { lockedResults, spies, tx } = createTx([
      venue,
      [{ competitionId: competition.id }],
      [{ centerId: "center-1" }],
      competition,
    ]);
    lockedResults.push([{ ...edition, lifecycle: "registration_open" }]);

    await kalakritiCompetitionMutators.updateVenue.fn({
      args: {
        auditEntryId: "venue-name-audit",
        name: "Main Auditorium",
        now: 2,
        venueId: venue.id,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as unknown as Parameters<
      typeof kalakritiCompetitionMutators.updateVenue.fn
    >[0]);

    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.meta).toEqual(
      expect.objectContaining({
        centerIds: ["center-1"],
        competitionIds: [competition.id],
        editionId: edition.id,
        revision: "venue-name-audit",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          competitionCategoryIds: [competition.competitionCategoryId],
          competitionIds: [competition.id],
          name: "Main Auditorium",
        },
        targetType: "venue",
      })
    );
  });

  it("rejects a same-Venue Session overlap", async () => {
    const existingSession = {
      cancelledAt: null,
      endAt: Date.parse("2027-11-21T06:00:00.000Z"),
      id: "session-existing",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: venue.id,
    };
    const { lockedResults, spies, tx } = createTx([
      competition,
      { editionId: edition.id, id: "age-1" },
      venue,
      [existingSession],
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.createSession.fn({
        args: {
          ageCategoryId: "age-1",
          auditEntryId: "audit-1",
          capacity: 20,
          competitionId: competition.id,
          editionId: edition.id,
          endAt: Date.parse("2027-11-21T06:30:00.000Z"),
          now: 1,
          sessionId: "session-1",
          startAt: Date.parse("2027-11-21T05:30:00.000Z"),
          venueId: venue.id,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.createSession.fn
      >[0])
    ).rejects.toThrow("overlapping Session");
    expect(spies.insertSession).not.toHaveBeenCalled();
  });

  it("protects referenced Competitions from deletion", async () => {
    const { lockedResults, spies, tx } = createTx([
      competition,
      { id: "session-1" },
      undefined,
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.deleteCompetition.fn({
        args: { auditEntryId: "audit-1", id: competition.id, now: 1 },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.deleteCompetition.fn
      >[0])
    ).rejects.toThrow("referenced");
    expect(spies.deleteCompetition).not.toHaveBeenCalled();
  });

  it("protects Sessions with Entries from deletion", async () => {
    const session = {
      ageCategoryId: "age-1",
      cancelledAt: null,
      capacity: 20,
      competitionId: competition.id,
      editionId: edition.id,
      endAt: Date.parse("2027-11-21T05:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: venue.id,
    };
    const { lockedResults, spies, tx } = createTx([session, { id: "entry-1" }]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.deleteSession.fn({
        args: { auditEntryId: "audit-1", id: session.id, now: 1 },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.deleteSession.fn
      >[0])
    ).rejects.toThrow("has Entries and cannot be deleted");
    expect(spies.deleteSession).not.toHaveBeenCalled();
  });

  it("revalidates Venue overlap before restoring a Session", async () => {
    const cancelledSession = {
      ageCategoryId: "age-1",
      cancelledAt: 1,
      capacity: 20,
      competitionId: competition.id,
      editionId: edition.id,
      endAt: Date.parse("2027-11-21T06:00:00.000Z"),
      id: "session-cancelled",
      startAt: Date.parse("2027-11-21T05:00:00.000Z"),
      venueId: venue.id,
    };
    const { lockedResults, spies, tx } = createTx([
      cancelledSession,
      competition,
      { editionId: edition.id, id: "age-1" },
      venue,
      [
        cancelledSession,
        {
          cancelledAt: null,
          endAt: Date.parse("2027-11-21T06:30:00.000Z"),
          id: "session-active",
          startAt: Date.parse("2027-11-21T05:30:00.000Z"),
          venueId: venue.id,
        },
      ],
      [],
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiCompetitionMutators.setSessionCancelled.fn({
        args: {
          auditEntryId: "audit-restore",
          enabled: false,
          id: cancelledSession.id,
          now: 2,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCompetitionMutators.setSessionCancelled.fn
      >[0])
    ).rejects.toThrow("overlapping Session");
    expect(spies.updateSession).not.toHaveBeenCalled();
  });
});
