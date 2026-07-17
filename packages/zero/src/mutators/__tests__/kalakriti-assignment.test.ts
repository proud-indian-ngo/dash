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
  return {
    spies,
    tx: {
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
  it("defers a missing picker user row to the authoritative server run", async () => {
    const { tx, spies } = createTx(
      [{ id: "edition-1", teamEventId: "event-1" }, undefined],
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
      { id: "edition-1", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: "+919999999999",
        role: "volunteer",
      },
      undefined,
      { permissionId: "kalakriti.view", roleId: "volunteer" },
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
      { id: "edition-1", teamEventId: "event-1" },
      {
        email: "volunteer@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Volunteer One",
        phone: null,
        role: "volunteer",
      },
      undefined,
      { permissionId: "kalakriti.view", roleId: "volunteer" },
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
      { id: "edition-1", teamEventId: "event-1" },
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

  it("rejects a volunteer whose role lacks Kalakriti access", async () => {
    const { tx, spies } = createTx([
      { id: "edition-1", teamEventId: "event-1" },
      {
        id: "volunteer-1",
        isActive: true,
        role: "unoriented_volunteer",
      },
      undefined,
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
    ).rejects.toThrow("Volunteer does not have Kalakriti access");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
    expect(spies.insertMembership).not.toHaveBeenCalled();
  });
});

describe("kalakritiAssignment.assignLiaison", () => {
  it("lets a Volunteer Coordinator assign one volunteer to a Center", async () => {
    const { tx, spies } = createTx([
      { id: "actor-membership" },
      [{ responsibility: "volunteer_coordinator" }],
      { id: "edition-1", teamEventId: "event-1" },
      { editionId: "edition-1", id: "center-1", retiredAt: null },
      {
        email: "liaison@example.com",
        id: "volunteer-1",
        isActive: true,
        name: "Liaison One",
        phone: null,
        role: "volunteer",
      },
      undefined,
      { permissionId: "kalakriti.view", roleId: "volunteer" },
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
        responsibility: "liaison",
      })
    );
    expect(spies.insertMembership).toHaveBeenCalledOnce();
    expect(spies.insertEventMember).toHaveBeenCalledOnce();
  });
});

describe("kalakritiAssignment.remove", () => {
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
      { id: "edition-1", teamEventId: "event-1" },
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

  it("archives membership and removes the linked event member after the final role", async () => {
    const { tx, spies } = createTx([
      {
        editionId: "edition-1",
        id: "assignment-1",
        isPrimary: true,
        membershipId: "membership-1",
        responsibility: "edition_admin",
      },
      { id: "membership-1", userId: "volunteer-1" },
      { id: "edition-1", teamEventId: "event-1" },
      [{ id: "assignment-1", isPrimary: true }],
      { id: "event-member-1" },
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

    expect(spies.updateMembership).toHaveBeenCalledWith(
      expect.objectContaining({ id: "membership-1", state: "archived" })
    );
    expect(spies.deleteEventMember).toHaveBeenCalledWith({
      id: "event-member-1",
    });
  });
});
