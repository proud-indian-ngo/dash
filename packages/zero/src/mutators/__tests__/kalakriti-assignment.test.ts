import { describe, expect, it, vi } from "vitest";
import { kalakritiAssignmentMutators } from "../kalakriti-assignment";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};

const assignArgs = {
  assignmentId: "assignment-new",
  auditEntryId: "audit-1",
  editionId: "edition-1",
  makePrimary: false,
  membershipId: "membership-new",
  now: 1_700_000_000_000,
  responsibility: "volunteer_coordinator" as const,
  teamEventMemberId: "event-member-new",
  userId: "volunteer-1",
};

function createMutationSpies() {
  return {
    deleteAssignment: vi.fn(),
    deleteEventMember: vi.fn(),
    insertAssignment: vi.fn(),
    insertAudit: vi.fn(),
    insertEventMember: vi.fn(),
    insertMembership: vi.fn(),
    updateAssignment: vi.fn(),
    updateMembership: vi.fn(),
  };
}

function createTx(
  results: unknown[],
  location: "client" | "server" = "server"
) {
  const spies = createMutationSpies();
  const lockedCenters: unknown[][] = [
    [{ editionId: "edition-1", id: "center-1", retiredAt: null }],
  ];
  const lockForUpdate = vi.fn(async () => lockedCenters.shift() ?? []);
  const select = vi.fn(() => {
    const query = {
      for: lockForUpdate,
      from: vi.fn(),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  });
  return {
    lockedCenters,
    lockForUpdate,
    spies,
    tx: {
      dbTransaction: { wrappedTransaction: { select } },
      location,
      mutate: {
        kalakritiAssignment: {
          delete: spies.deleteAssignment,
          insert: spies.insertAssignment,
          update: spies.updateAssignment,
        },
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiEditionMembership: {
          insert: spies.insertMembership,
          update: spies.updateMembership,
        },
        teamEventMember: {
          delete: spies.deleteEventMember,
          insert: spies.insertEventMember,
        },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

describe("kalakritiAssignment.assignVolunteer", () => {
  it("rejects assignments in an archived Edition", async () => {
    const { tx, spies } = createTx([
      {
        id: "edition-1",
        lifecycle: "archived",
        teamEventId: "event-1",
      },
    ]);

    await expect(
      kalakritiAssignmentMutators.assignVolunteer.fn({
        args: assignArgs,
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignVolunteer.fn
      >[0])
    ).rejects.toThrow("Archived Editions cannot change assignments");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
    expect(spies.insertMembership).not.toHaveBeenCalled();
  });

  it("defers a missing picker user row to the authoritative server run", async () => {
    const { tx, spies } = createTx(
      [
        { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
        undefined,
      ],
      "client"
    );

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: assignArgs,
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertAssignment).not.toHaveBeenCalled();
    expect(spies.insertMembership).not.toHaveBeenCalled();
  });

  it("creates membership, assignment, and linked event member together", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: "+919999999999",
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: assignArgs,
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "membership-new",
        kind: "volunteer",
        state: "active",
        userId: "volunteer-1",
      })
    );
    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        isPrimary: true,
        responsibility: "volunteer_coordinator",
      })
    );
    expect(spies.insertEventMember).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        userId: "volunteer-1",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledOnce();
  });

  it("does not duplicate the linked event member for another role", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: null,
        role: "volunteer",
      },
      undefined,
      {
        id: "membership-1",
        kind: "volunteer",
        state: "active",
      },
      [
        {
          createdAt: 1,
          id: "assignment-1",
          isPrimary: true,
          responsibility: "edition_admin",
        },
      ],
      { id: "event-member-1" },
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: assignArgs,
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertMembership).not.toHaveBeenCalled();
    expect(spies.insertAssignment).toHaveBeenCalledOnce();
    expect(spies.insertEventMember).not.toHaveBeenCalled();
  });

  it("prevents Volunteer Coordinators from appointing another coordinator", async () => {
    const { tx, spies } = createTx([
      { id: "actor-membership" },
      [{ responsibility: "volunteer_coordinator" }],
    ]);

    await expect(
      kalakritiAssignmentMutators.assignVolunteer.fn({
        args: assignArgs,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "actor-1",
        },
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignVolunteer.fn
      >[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });

  it("rejects an external identity at the authoritative boundary", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        id: "volunteer-1",
        isActive: true,
        role: "external_user",
      },
      { userId: "volunteer-1" },
    ]);

    await expect(
      kalakritiAssignmentMutators.assignVolunteer.fn({
        args: assignArgs,
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignVolunteer.fn
      >[0])
    ).rejects.toThrow("External identities cannot be volunteer assignments");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });

  it("rejects an unoriented volunteer", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        id: "volunteer-1",
        isActive: true,
        role: "unoriented_volunteer",
      },
      undefined,
    ]);

    await expect(
      kalakritiAssignmentMutators.assignVolunteer.fn({
        args: assignArgs,
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignVolunteer.fn
      >[0])
    ).rejects.toThrow("Unoriented volunteers cannot receive assignments");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
    expect(spies.insertMembership).not.toHaveBeenCalled();
  });

  it("assigns a custom oriented role without Kalakriti view", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "lead@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Team Lead",
        phone: null,
        role: "team_lead",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: assignArgs,
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertMembership).toHaveBeenCalledOnce();
    expect(spies.insertAssignment).toHaveBeenCalledOnce();
  });

  it("assigns an operational lead at Edition scope", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "food@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Food Lead",
        phone: null,
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: {
        ...assignArgs,
        responsibility: "food_lead",
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: null,
        competitionCategoryId: null,
        competitionId: null,
        responsibility: "food_lead",
      })
    );
  });

  it("assigns overall events lead when another volunteer already holds it", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "events@example.com",
        id: "volunteer-2",
        isActive: true,
        name: "Events Lead Two",
        phone: null,
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: {
        ...assignArgs,
        assignmentId: "assignment-lead-2",
        membershipId: "membership-lead-2",
        responsibility: "overall_events_lead",
        userId: "volunteer-2",
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibility: "overall_events_lead",
      })
    );
  });

  it("assigns a Liaison Lead at Edition scope", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "liaison-lead@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Liaison Lead",
        phone: null,
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignVolunteer.fn({
      args: {
        ...assignArgs,
        responsibility: "liaison_lead",
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignVolunteer.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: null,
        competitionCategoryId: null,
        competitionId: null,
        responsibility: "liaison_lead",
      })
    );
  });
});

describe("kalakritiAssignment.assignLiaison", () => {
  it("lets a Volunteer Coordinator assign one volunteer to a Center", async () => {
    const { lockForUpdate, tx, spies } = createTx([
      { id: "actor-membership" },
      [{ responsibility: "volunteer_coordinator" }],
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "liaison@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Liaison One",
        phone: null,
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignLiaison.fn({
      args: {
        assignmentId: "liaison-assignment-1",
        auditEntryId: "audit-1",
        centerId: "center-1",
        editionId: "edition-1",
        makePrimary: false,
        membershipId: "liaison-membership-1",
        now: 1_700_000_000_000,
        responsibility: "liaison_volunteer",
        teamEventMemberId: "event-member-1",
        userId: "volunteer-1",
      },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "coordinator-1",
      },
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignLiaison.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: "center-1",
        responsibility: "liaison_volunteer",
      })
    );
    expect(spies.insertMembership).toHaveBeenCalledOnce();
    expect(spies.insertEventMember).toHaveBeenCalledOnce();
    expect(lockForUpdate).toHaveBeenCalledWith("update");
  });

  it("allows the same Liaison on another Center but rejects a duplicate scope", async () => {
    const volunteer = {
      email: "liaison@example.com",
      id: "volunteer-1",
      isActive: true,
      name: "Liaison One",
      phone: null,
      role: "volunteer",
    };
    const existingAssignment = {
      centerId: "center-1",
      id: "liaison-assignment-1",
      isPrimary: true,
      responsibility: "liaison_volunteer",
    };
    const { lockedCenters, spies, tx } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      volunteer,
      undefined,
      { id: "liaison-membership-1", kind: "volunteer", state: "active" },
      [existingAssignment],
      { id: "event-member-1" },
    ]);
    lockedCenters.splice(0, 1, [
      { editionId: "edition-1", id: "center-2", retiredAt: null },
    ]);

    await kalakritiAssignmentMutators.assignLiaison.fn({
      args: {
        assignmentId: "liaison-assignment-2",
        auditEntryId: "audit-2",
        centerId: "center-2",
        editionId: "edition-1",
        makePrimary: false,
        membershipId: "unused-membership",
        now: 1_700_000_000_001,
        responsibility: "liaison_volunteer",
        teamEventMemberId: "unused-event-member",
        userId: "volunteer-1",
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignLiaison.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ centerId: "center-2" })
    );

    const duplicate = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      volunteer,
      undefined,
      { id: "liaison-membership-1", kind: "volunteer", state: "active" },
      [{ ...existingAssignment, centerId: "center-2" }],
    ]);
    duplicate.lockedCenters.splice(0, 1, [
      { editionId: "edition-1", id: "center-2", retiredAt: null },
    ]);

    await expect(
      kalakritiAssignmentMutators.assignLiaison.fn({
        args: {
          assignmentId: "liaison-assignment-3",
          auditEntryId: "audit-3",
          centerId: "center-2",
          editionId: "edition-1",
          makePrimary: false,
          membershipId: "unused-membership",
          now: 1_700_000_000_002,
          responsibility: "liaison_volunteer",
          teamEventMemberId: "unused-event-member",
          userId: "volunteer-1",
        },
        ctx: adminContext,
        tx: duplicate.tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignLiaison.fn
      >[0])
    ).rejects.toThrow("already has this scoped responsibility");
    expect(duplicate.spies.insertAssignment).not.toHaveBeenCalled();
  });
});

describe("Kalakriti Competition assignments", () => {
  it("lets a Volunteer Coordinator assign a Category Lead", async () => {
    const { tx, spies } = createTx([
      { id: "actor-membership" },
      [{ responsibility: "volunteer_coordinator" }],
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      { editionId: "edition-1", id: "category-1", retiredAt: null },
      {
        email: "lead@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Category Lead",
        phone: null,
        role: "volunteer",
      },
      undefined,
      undefined,
      [],
      undefined,
    ]);

    await kalakritiAssignmentMutators.assignCompetitionCategoryLead.fn({
      args: {
        assignmentId: "assignment-category-1",
        auditEntryId: "audit-category-1",
        competitionCategoryId: "category-1",
        editionId: "edition-1",
        makePrimary: false,
        membershipId: "membership-category-1",
        now: 1_700_000_000_000,
        responsibility: "competition_category_lead",
        teamEventMemberId: "event-member-category-1",
        userId: "volunteer-1",
      },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "coordinator-1",
      },
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.assignCompetitionCategoryLead.fn
    >[0]);

    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionCategoryId: "category-1",
        competitionId: null,
        responsibility: "competition_category_lead",
      })
    );
  });

  it("rejects a Competition assignment outside the Edition", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      { editionId: "edition-2", id: "competition-1", retiredAt: null },
    ]);

    await expect(
      kalakritiAssignmentMutators.assignCompetitionMember.fn({
        args: {
          assignmentId: "assignment-competition-1",
          auditEntryId: "audit-competition-1",
          competitionId: "competition-1",
          editionId: "edition-1",
          makePrimary: false,
          membershipId: "membership-competition-1",
          now: 1_700_000_000_000,
          responsibility: "competition_coordinator",
          teamEventMemberId: "event-member-competition-1",
          userId: "volunteer-1",
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.assignCompetitionMember.fn
      >[0])
    ).rejects.toThrow("Competition not found in this Edition");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });
});

describe("kalakritiAssignment.remove", () => {
  it("rejects removals in an archived Edition", async () => {
    const { tx, spies } = createTx([
      {
        editionId: "edition-1",
        id: "assignment-1",
        isPrimary: true,
        membershipId: "membership-1",
        responsibility: "edition_admin",
      },
      { id: "membership-1", userId: "volunteer-1" },
      {
        id: "edition-1",
        lifecycle: "archived",
        teamEventId: "event-1",
      },
    ]);

    await expect(
      kalakritiAssignmentMutators.remove.fn({
        args: {
          assignmentId: "assignment-1",
          auditEntryId: "audit-1",
          now: 1_700_000_000_000,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.remove.fn
      >[0])
    ).rejects.toThrow("Archived Editions cannot change assignments");
    expect(spies.deleteAssignment).not.toHaveBeenCalled();
    expect(spies.updateMembership).not.toHaveBeenCalled();
  });

  it("keeps membership and event roster when another assignment remains", async () => {
    const { tx, spies } = createTx([
      {
        editionId: "edition-1",
        id: "assignment-1",
        isPrimary: false,
        membershipId: "membership-1",
        responsibility: "overall_events_lead",
      },
      { id: "membership-1", userId: "volunteer-1" },
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      [
        { id: "assignment-1", isPrimary: false },
        { id: "assignment-2", isPrimary: true },
      ],
    ]);

    await kalakritiAssignmentMutators.remove.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.remove.fn
    >[0]);

    expect(spies.deleteAssignment).toHaveBeenCalledWith({ id: "assignment-1" });
    expect(spies.updateMembership).not.toHaveBeenCalled();
    expect(spies.deleteEventMember).not.toHaveBeenCalled();
  });

  it("leaves membership and the linked event member after the final role", async () => {
    const { tx, spies } = createTx([
      {
        editionId: "edition-1",
        id: "assignment-1",
        isPrimary: true,
        membershipId: "membership-1",
        responsibility: "edition_admin",
      },
      { id: "membership-1", userId: "volunteer-1" },
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      [{ id: "assignment-1", isPrimary: true }],
    ]);

    await kalakritiAssignmentMutators.remove.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.remove.fn
    >[0]);

    expect(spies.deleteAssignment).toHaveBeenCalledWith({ id: "assignment-1" });
    expect(spies.updateMembership).not.toHaveBeenCalled();
    expect(spies.deleteEventMember).not.toHaveBeenCalled();
  });
});

describe("kalakritiAssignment.addVolunteers", () => {
  it("creates unassigned membership and a linked event member", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: null,
        role: "unoriented_volunteer",
      },
      undefined,
      undefined,
      undefined,
    ]);

    await kalakritiAssignmentMutators.addVolunteers.fn({
      args: {
        auditEntryId: "audit-1",
        editionId: "edition-1",
        now: 1_700_000_000_000,
        volunteers: [
          {
            membershipId: "membership-new",
            teamEventMemberId: "event-member-new",
            userId: "volunteer-1",
          },
        ],
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.addVolunteers.fn
    >[0]);

    expect(spies.insertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "membership-new",
        kind: "volunteer",
        state: "active",
        userId: "volunteer-1",
      })
    );
    expect(spies.insertEventMember).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        userId: "volunteer-1",
      })
    );
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });

  it("throws when every selected volunteer is already on the roster", async () => {
    const { tx } = createTx([
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: null,
        role: "volunteer",
      },
      undefined,
      {
        editionId: "edition-1",
        id: "membership-1",
        kind: "volunteer",
        state: "active",
        userId: "volunteer-1",
      },
      { id: "event-member-1" },
    ]);

    await expect(
      kalakritiAssignmentMutators.addVolunteers.fn({
        args: {
          auditEntryId: "audit-1",
          editionId: "edition-1",
          now: 1_700_000_000_000,
          volunteers: [
            {
              membershipId: "membership-new",
              teamEventMemberId: "event-member-new",
              userId: "volunteer-1",
            },
          ],
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiAssignmentMutators.addVolunteers.fn
      >[0])
    ).rejects.toThrow("No volunteers were added");
  });

  it("defers a missing picker user row to the authoritative server run", async () => {
    const { tx, spies } = createTx(
      [
        { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
        undefined,
      ],
      "client"
    );

    await kalakritiAssignmentMutators.addVolunteers.fn({
      args: {
        auditEntryId: "audit-1",
        editionId: "edition-1",
        now: 1_700_000_000_000,
        volunteers: [
          {
            membershipId: "membership-new",
            teamEventMemberId: "event-member-new",
            userId: "volunteer-1",
          },
        ],
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.addVolunteers.fn
    >[0]);

    expect(spies.insertMembership).not.toHaveBeenCalled();
    expect(spies.insertEventMember).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });
});

describe("kalakritiAssignment.removeVolunteer", () => {
  it("archives membership and drops the linked event member", async () => {
    const { tx, spies } = createTx([
      {
        editionId: "edition-1",
        id: "membership-1",
        kind: "volunteer",
        state: "active",
        userId: "volunteer-1",
      },
      { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
      [{ id: "assignment-1" }],
      { id: "event-member-1" },
    ]);

    await kalakritiAssignmentMutators.removeVolunteer.fn({
      args: {
        auditEntryId: "audit-1",
        membershipId: "membership-1",
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiAssignmentMutators.removeVolunteer.fn
    >[0]);

    expect(spies.deleteAssignment).toHaveBeenCalledWith({ id: "assignment-1" });
    expect(spies.updateMembership).toHaveBeenCalledWith(
      expect.objectContaining({ id: "membership-1", state: "archived" })
    );
    expect(spies.deleteEventMember).toHaveBeenCalledWith({
      id: "event-member-1",
    });
  });
});
