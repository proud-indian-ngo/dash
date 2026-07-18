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

const emptyCloneArgs = {
  ageCategoryIds: [],
  auditEntryId: "audit",
  competitionCategoryIds: [],
  competitionIds: [],
  confirmed: true,
  now: 1,
  sourceEditionId: "source",
  targetEditionId: "target",
  venueIds: [],
};

function createEditionCommandTx(results: unknown[]) {
  const spies = {
    insertAgeCategory: vi.fn(),
    insertAudit: vi.fn(),
    insertCompetition: vi.fn(),
    insertCompetitionCategory: vi.fn(),
    insertVenue: vi.fn(),
    updateEdition: vi.fn(),
  };
  return {
    spies,
    tx: {
      location: "client" as const,
      mutate: {
        kalakritiAgeCategory: { insert: spies.insertAgeCategory },
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiCompetition: { insert: spies.insertCompetition },
        kalakritiCompetitionCategory: {
          insert: spies.insertCompetitionCategory,
        },
        kalakritiEdition: { insert: vi.fn(), update: spies.updateEdition },
        kalakritiVenue: { insert: spies.insertVenue },
        teamEvent: { insert: vi.fn() },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

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

  it.each([
    [
      "invalid_dates",
      () => ({
        ...readySnapshot,
        edition: { ...readySnapshot.edition, timezone: null },
      }),
    ],
    ["no_active_centers", () => ({ ...readySnapshot, centers: [] })],
    ["missing_age_categories", () => ({ ...readySnapshot, ageCategories: [] })],
    [
      "overlapping_age_categories",
      () => ({
        ...readySnapshot,
        ageCategories: [
          ...readySnapshot.ageCategories,
          { id: "age-2", maximumAge: 15, minimumAge: 12 },
        ],
      }),
    ],
    ["missing_center_age_quotas", () => ({ ...readySnapshot, quotas: [] })],
    [
      "no_active_competitions",
      () => ({
        ...readySnapshot,
        competitions: readySnapshot.competitions.map((row) => ({
          ...row,
          cancelledAt: 1,
        })),
      }),
    ],
    ["competition_missing_session", () => ({ ...readySnapshot, sessions: [] })],
    [
      "no_active_venues",
      () => ({
        ...readySnapshot,
        venues: readySnapshot.venues.map((row) => ({ ...row, retiredAt: 1 })),
      }),
    ],
    [
      "invalid_active_sessions",
      () => ({
        ...readySnapshot,
        sessions: readySnapshot.sessions.map((row) => ({
          ...row,
          capacity: 0,
        })),
      }),
    ],
  ] as const)("reports the %s readiness blocker", (code, snapshot) => {
    expect(
      getKalakritiRegistrationReadiness(snapshot()).map(
        (blocker) => blocker.code
      )
    ).toContain(code);
  });

  it("accepts a complete same-day readiness snapshot", () => {
    expect(getKalakritiRegistrationReadiness(readySnapshot)).toEqual([]);
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

  it("rejects an ordinary member before cloning configuration", async () => {
    const edition = {
      eventDate: "2028-11-19",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const { spies, tx } = createEditionCommandTx([
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      undefined,
    ]);

    await expect(
      kalakritiEditionMutators.cloneConfiguration.fn({
        args: emptyCloneArgs,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "ordinary-member-1",
        },
        tx,
      } as unknown as Parameters<
        typeof kalakritiEditionMutators.cloneConfiguration.fn
      >[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
    expect(spies.insertCompetitionCategory).not.toHaveBeenCalled();
    expect(spies.insertCompetition).not.toHaveBeenCalled();
    expect(spies.insertVenue).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });

  it("requires an Edition Administrator assignment on the clone target", async () => {
    const edition = {
      eventDate: "2028-11-19",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const { spies, tx } = createEditionCommandTx([
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      { id: "source-membership" },
      { id: "source-assignment" },
      undefined,
    ]);

    await expect(
      kalakritiEditionMutators.cloneConfiguration.fn({
        args: emptyCloneArgs,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "source-edition-admin-1",
        },
        tx,
      } as unknown as Parameters<
        typeof kalakritiEditionMutators.cloneConfiguration.fn
      >[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
    expect(spies.insertCompetitionCategory).not.toHaveBeenCalled();
    expect(spies.insertCompetition).not.toHaveBeenCalled();
    expect(spies.insertVenue).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
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

  it("rejects an invalid lifecycle edge without writing", async () => {
    const { spies, tx } = createEditionCommandTx([
      {
        eventDate: "2028-11-19",
        id: "edition-1",
        lifecycle: "draft",
        timezone: "Asia/Kolkata",
      },
    ]);

    await expect(
      kalakritiEditionMutators.transition.fn({
        args: {
          auditEntryId: "audit",
          confirmed: true,
          editionId: "edition-1",
          now: 1,
          targetLifecycle: "registration_locked",
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiEditionMutators.transition.fn
      >[0])
    ).rejects.toThrow("Invalid Edition lifecycle transition");
    expect(spies.updateEdition).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["locking an open Edition", "registration_open", "registration_locked"],
    ["reopening a locked Edition", "registration_locked", "registration_open"],
  ] as const)(
    "rechecks readiness before %s",
    async (_, lifecycle, targetLifecycle) => {
      const currentEdition = {
        eventDate: "2028-11-19",
        id: "edition-1",
        lifecycle,
        timezone: "Asia/Kolkata",
      };
      const { spies, tx } = createEditionCommandTx([
        currentEdition,
        { ...readySnapshot.edition, ...currentEdition },
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ]);

      await expect(
        kalakritiEditionMutators.transition.fn({
          args: {
            auditEntryId: "audit",
            confirmed: true,
            editionId: currentEdition.id,
            now: 1,
            targetLifecycle,
          },
          ctx: adminContext,
          tx,
        } as unknown as Parameters<
          typeof kalakritiEditionMutators.transition.fn
        >[0])
      ).rejects.toThrow("Edition is not ready");
      expect(spies.updateEdition).not.toHaveBeenCalled();
      expect(spies.insertAudit).not.toHaveBeenCalled();
    }
  );

  it("enqueues lifecycle delivery and a separate deterministic close reminder after opening", async () => {
    const currentEdition = {
      eventDate: "2028-11-19",
      id: "edition-1",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const select = vi.fn(() => {
      const query = {
        for: vi.fn(async () => [currentEdition]),
        from: vi.fn(),
        where: vi.fn(),
      };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    });
    const results = [
      {
        ...readySnapshot.edition,
        id: currentEdition.id,
        lifecycle: currentEdition.lifecycle,
        timezone: currentEdition.timezone,
      },
      readySnapshot.centers,
      readySnapshot.ageCategories,
      readySnapshot.quotas,
      readySnapshot.competitionCategories,
      readySnapshot.competitions,
      readySnapshot.sessions,
      readySnapshot.venues,
    ];
    const asyncTasks: Array<{
      fn: () => Promise<void>;
      meta: Record<string, unknown>;
    }> = [];
    const tx = {
      dbTransaction: { wrappedTransaction: { select } },
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: vi.fn() },
        kalakritiEdition: { update: vi.fn() },
      },
      run: vi.fn(async () => results.shift()),
    };
    const args = {
      auditEntryId: "transition-1",
      confirmed: true as const,
      editionId: currentEdition.id,
      now: 1,
      targetLifecycle: "registration_open" as const,
    };

    await kalakritiEditionMutators.transition.fn({
      args,
      ctx: { ...adminContext, asyncTasks, traceId: "trace-1" },
      tx,
    } as unknown as Parameters<
      typeof kalakritiEditionMutators.transition.fn
    >[0]);

    expect(asyncTasks).toHaveLength(2);
    expect(asyncTasks.map(({ meta }) => meta)).toEqual([
      expect.objectContaining({
        editionId: currentEdition.id,
        targetLifecycle: "registration_open",
        transitionId: args.auditEntryId,
      }),
      expect.objectContaining({
        editionId: currentEdition.id,
        plannedRegistrationCloseAt:
          readySnapshot.edition.plannedRegistrationCloseAt,
      }),
    ]);
  });

  it("clones only active structural Competition configuration", async () => {
    const edition = {
      eventDate: "2028-11-19",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const ageCategory = {
      id: "age-active",
      maxCompetitionsPerCategory: 2,
      maximumAge: 12,
      maxTotalCompetitions: 4,
      minimumAge: 6,
      name: "Junior",
      normalizedName: "junior",
      sortOrder: 0,
    };
    const activeCategory = {
      id: "category-active",
      name: "Arts",
      normalizedName: "arts",
      retiredAt: null,
      sortOrder: 0,
    };
    const retiredCategory = {
      ...activeCategory,
      id: "category-retired",
      retiredAt: 1,
    };
    const activeCompetition = {
      cancelledAt: null,
      competitionCategoryId: activeCategory.id,
      genderEligibility: "both",
      id: "competition-active",
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Dance",
      normalizedName: "dance",
      participationMode: "individual",
      retiredAt: null,
    };
    const activeVenue = {
      id: "venue-active",
      name: "Stage",
      normalizedName: "stage",
      retiredAt: null,
    };
    const { spies, tx } = createEditionCommandTx([
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      { ...edition, id: "target" },
      [],
      [],
      [],
      [],
      [ageCategory],
      [activeCategory, retiredCategory],
      [
        activeCompetition,
        { ...activeCompetition, cancelledAt: 1, id: "competition-cancelled" },
        {
          ...activeCompetition,
          competitionCategoryId: retiredCategory.id,
          id: "competition-orphaned",
        },
      ],
      [activeVenue, { ...activeVenue, id: "venue-retired", retiredAt: 1 }],
    ]);

    await kalakritiEditionMutators.cloneConfiguration.fn({
      args: {
        ageCategoryIds: [{ sourceId: ageCategory.id, targetId: "age-target" }],
        auditEntryId: "audit",
        competitionCategoryIds: [
          { sourceId: activeCategory.id, targetId: "category-target" },
        ],
        competitionIds: [
          { sourceId: activeCompetition.id, targetId: "competition-target" },
        ],
        confirmed: true,
        now: 1,
        sourceEditionId: "source",
        targetEditionId: "target",
        venueIds: [{ sourceId: activeVenue.id, targetId: "venue-target" }],
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiEditionMutators.cloneConfiguration.fn
    >[0]);

    expect(spies.insertCompetitionCategory).toHaveBeenCalledOnce();
    expect(spies.insertCompetition).toHaveBeenCalledOnce();
    expect(spies.insertCompetition).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelledAt: null,
        id: "competition-target",
      })
    );
    expect(spies.insertVenue).toHaveBeenCalledOnce();
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          copied: {
            ageCategories: 1,
            competitionCategories: 1,
            competitions: 1,
            venues: 1,
          },
        }),
      })
    );
  });

  it("rejects an incomplete clone ID map", async () => {
    const edition = {
      eventDate: "2028-11-19",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const { spies, tx } = createEditionCommandTx([
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      { ...edition, id: "target" },
      [],
      [],
      [],
      [],
      [{ id: "age-source" }],
      [],
      [],
      [],
    ]);

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
    ).rejects.toThrow("Age Category ID map");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });

  it("rejects cloning into a target with structural configuration", async () => {
    const edition = {
      eventDate: "2028-11-19",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    };
    const { spies, tx } = createEditionCommandTx([
      { ...edition, id: "source" },
      { ...edition, id: "target" },
      { ...edition, id: "target" },
      [{ id: "existing-age" }],
      [],
      [],
      [],
    ]);

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
    ).rejects.toThrow("Target Edition must have no structural configuration");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });
});
