import { describe, expect, it, mock } from "bun:test";

import {
  kalakritiAttendeeCreateSchema,
  kalakritiAttendeeMutators,
} from "../kalakriti-attendee";

const edition = {
  id: "edition-1",
  lifecycle: "live",
  eventDate: "2027-11-21",
  timezone: "Asia/Kolkata",
  year: 2027,
  nextJudgeSequence: 1,
};
const base = {
  id: "attendee-1",
  editionId: edition.id,
  now: 1000,
  auditEntryId: "audit-1",
};
const admin = {
  userId: "admin",
  permissions: ["kalakriti.admin"],
  role: "admin",
};
const person = {
  ...base,
  kind: "judge",
  humanId: "KALJ-2027-0009",
  name: "Judge",
  phone: "123",
  email: null,
  archivedAt: null,
};
function fixture(results: unknown[], lifecycle = "live") {
  const order: string[] = [];
  const insert = mock(),
    update = mock(),
    audit = mock(),
    add = mock(),
    remove = mock(() => order.push("delete-assignment")),
    deleteAttendee = mock(() => order.push("delete-attendee")),
    updateEdition = mock();
  const select = () => {
    const query = {
      from: () => query,
      where: () => query,
      for: async () => {
        order.push("edition-lock");
        return [{ ...edition, lifecycle }];
      },
    };
    return query;
  };
  return {
    order,
    insert,
    update,
    audit,
    add,
    remove,
    deleteAttendee,
    updateEdition,
    tx: {
      location: "server",
      dbTransaction: { wrappedTransaction: { select } },
      run: mock(async (_query: unknown) => {
        order.push("query");
        return results.shift();
      }),
      mutate: {
        kalakritiAttendee: { insert, update, delete: deleteAttendee },
        kalakritiEdition: { update: updateEdition },
        kalakritiAuditEntry: { insert: audit },
        kalakritiJudgeAssignment: { insert: add, delete: remove },
      },
    },
  };
}
type Command = keyof typeof kalakritiAttendeeMutators;
async function invoke(
  command: Command,
  tx: ReturnType<typeof fixture>["tx"],
  args: unknown,
  ctx = admin
) {
  await kalakritiAttendeeMutators[command].fn({
    tx,
    args,
    ctx: { ...ctx, _permissionSet: undefined },
  } as never);
}

describe("Overall Events Lead Judge editing", () => {
  it("rejects reuse of a printed card instead of reporting another person's registration as successful", async () => {
    const f = fixture([person]);
    await expect(
      invoke("create", f.tx, {
        ...base,
        kind: "judge",
        name: "Someone else",
        phone: "+919876543210",
        printedCard: true,
      })
    ).rejects.toThrow("already registered");
    expect(f.insert).not.toHaveBeenCalled();
  });
  const lead = {
    userId: "lead",
    permissions: ["kalakriti.view"],
    role: "volunteer",
  };
  it("updates Judge details under active Edition-scoped volunteer authority", async () => {
    const f = fixture([
      undefined,
      { id: "lead-membership" },
      undefined,
      person,
    ]);
    await invoke("update", f.tx, { ...base, name: "Updated Judge" }, lead);
    expect(f.update).toHaveBeenCalledWith({
      id: base.id,
      name: "Updated Judge",
      updatedAt: base.now,
    });
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { changedFields: ["name"] } })
    );
    const query = f.tx.run.mock.calls[1]?.[0] as { ast: unknown };
    const scope = JSON.stringify(query.ast);
    for (const expected of [
      "overall_events_lead",
      "edition-1",
      "active",
      "volunteer",
      "lead",
    ])
      expect(scope).toContain(expected);
    expect(f.order[0]).toBe("edition-lock");
  });
  it("adds and removes Judge competition assignments", async () => {
    const f = fixture([
      undefined,
      { id: "lead-membership" },
      person,
      { id: "competition-2" },
      [{ id: "old-link", competitionId: "competition-1" }],
    ]);
    await invoke(
      "setCompetitions",
      f.tx,
      { ...base, competitionIds: ["competition-2"] },
      lead
    );
    expect(f.remove).toHaveBeenCalledWith({ id: "old-link" });
    expect(f.add).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeId: person.id,
        competitionId: "competition-2",
        createdBy: "lead",
      })
    );
  });
  it.each(["create", "archive"] as const)(
    "does not grant Guest %s authority",
    async (command) => {
      const f = fixture([undefined, undefined]);
      await expect(
        invoke(
          command,
          f.tx,
          { ...base, kind: "guest", name: "Guest", phone: "+919876543211" },
          lead
        )
      ).rejects.toThrow("Unauthorized");
      expect(f.tx.run).toHaveBeenCalledTimes(2);
      expect(f.insert).not.toHaveBeenCalled();
      expect(f.update).not.toHaveBeenCalled();
    }
  );
  it("creates Judges and advances the durable yearly ID counter", async () => {
    const f = fixture([
      undefined,
      { id: "lead-membership" },
      undefined,
      { ...edition, nextJudgeSequence: 12 },
      [person],
    ]);
    await invoke(
      "create",
      f.tx,
      { ...base, kind: "judge", name: "Judge", phone: "+919876543211" },
      lead
    );
    expect(f.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "judge",
        humanId: "KALJ-2027-0012",
        createdBy: "lead",
      })
    );
    expect(f.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextJudgeSequence: 13,
    });
  });
  it("deletes Judges after their assignments, preserving legacy yearly IDs", async () => {
    const f = fixture([
      undefined,
      { id: "lead-membership" },
      person,
      undefined,
      edition,
      [{ id: "assignment-1" }],
    ]);
    await invoke("delete", f.tx, base, lead);
    expect(f.remove).toHaveBeenCalledWith({ id: "assignment-1" });
    expect(f.deleteAttendee).toHaveBeenCalledWith({ id: person.id });
    expect(f.order.slice(-2)).toEqual(["delete-assignment", "delete-attendee"]);
    expect(f.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextJudgeSequence: 10,
    });
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "deleted",
        metadata: { removedAssignmentCount: 1 },
      })
    );
  });
  it.each([
    { ...person, kind: "guest" },
    { ...person, editionId: "other" },
  ])("rejects deletion of Guest or foreign targets: %j", async (target) => {
    const f = fixture([undefined, { id: "lead-membership" }, target]);
    await expect(invoke("delete", f.tx, base, lead)).rejects.toThrow(
      "Judge not found"
    );
    expect(f.deleteAttendee).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("denies Guest edits based on persisted kind, including no-op edits", async () => {
    const f = fixture([
      undefined,
      { id: "lead-membership" },
      undefined,
      { ...person, kind: "guest" },
    ]);
    await expect(
      invoke("update", f.tx, { ...base, name: person.name }, lead)
    ).rejects.toThrow("Unauthorized");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it.each(["create", "delete", "update", "setCompetitions"] as const)(
    "denies %s without active scoped authority and in archived Editions",
    async (command) => {
      const missing = fixture([undefined, undefined]);
      await expect(
        invoke(
          command,
          missing.tx,
          { ...base, kind: "judge", competitionIds: [] },
          lead
        )
      ).rejects.toThrow("Unauthorized");
      const archived = fixture([], "archived");
      await expect(
        invoke(command, archived.tx, { ...base, competitionIds: [] }, lead)
      ).rejects.toThrow("unavailable");
      expect(archived.tx.run).not.toHaveBeenCalled();
    }
  );
  it("rejects absent or out-of-Edition targets and competitions", async () => {
    const target = fixture([
      undefined,
      { id: "lead-membership" },
      undefined,
      undefined,
    ]);
    await expect(
      invoke("update", target.tx, { ...base, name: "Updated" }, lead)
    ).rejects.toThrow("Active attendee");
    const competition = fixture([
      undefined,
      { id: "lead-membership" },
      person,
      undefined,
    ]);
    await expect(
      invoke(
        "setCompetitions",
        competition.tx,
        { ...base, competitionIds: ["foreign"] },
        lead
      )
    ).rejects.toThrow("Active competition");
    expect(competition.remove).not.toHaveBeenCalled();
    expect(competition.add).not.toHaveBeenCalled();
  });
});

describe("Hospitality Lead Guest editing", () => {
  const hospitalityLead = {
    userId: "hospitality-lead",
    permissions: ["kalakriti.view"],
    role: "volunteer",
  };
  const guest = { ...person, kind: "guest", name: "Guest" };
  const authorizedUpdate = (target?: unknown) =>
    fixture([undefined, undefined, { id: "hospitality-membership" }, target]);
  const authorizedArchive = (target?: unknown) =>
    fixture([undefined, { id: "hospitality-membership" }, target]);

  it("creates Guests under active Edition-scoped authority", async () => {
    const f = fixture([
      undefined,
      { id: "hospitality-membership" },
      undefined,
      edition,
      [],
    ]);
    await invoke(
      "create",
      f.tx,
      { ...base, kind: "guest", name: "Guest", phone: "+919876543211" },
      hospitalityLead
    );
    expect(f.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "guest",
        createdBy: hospitalityLead.userId,
      })
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created" })
    );
    const scope = JSON.stringify(
      (f.tx.run.mock.calls[1]![0] as { ast: unknown }).ast
    );
    for (const expected of [
      "hospitality_lead",
      edition.id,
      hospitalityLead.userId,
      "active",
      "volunteer",
    ])
      expect(scope).toContain(expected);
  });

  it("updates and archives Guests with audit entries", async () => {
    const edit = authorizedUpdate(guest);
    await invoke(
      "update",
      edit.tx,
      { ...base, name: "Updated Guest" },
      hospitalityLead
    );
    expect(edit.update).toHaveBeenCalledWith({
      id: base.id,
      name: "Updated Guest",
      updatedAt: base.now,
    });
    expect(edit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "updated" })
    );

    const archive = authorizedArchive(guest);
    await invoke("archive", archive.tx, base, hospitalityLead);
    expect(archive.update).toHaveBeenCalledWith({
      id: base.id,
      archivedAt: base.now,
      updatedAt: base.now,
    });
    expect(archive.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "archived" })
    );
  });

  it("allows a volunteer with both lead assignments to update Guests and Judges", async () => {
    for (const target of [guest, person]) {
      const f = fixture([
        undefined,
        { id: "events-lead-membership" },
        { id: "hospitality-membership" },
        target,
      ]);
      await invoke(
        "update",
        f.tx,
        { ...base, name: "Updated" },
        hospitalityLead
      );
      expect(f.update).toHaveBeenCalledWith({
        id: base.id,
        name: "Updated",
        updatedAt: base.now,
      });
    }
  });

  it("cannot edit Judges or use Judge-only commands", async () => {
    const edit = authorizedUpdate(person);
    await expect(
      invoke("update", edit.tx, { ...base, name: person.name }, hospitalityLead)
    ).rejects.toThrow("Unauthorized");
    expect(edit.update).not.toHaveBeenCalled();
    expect(edit.audit).not.toHaveBeenCalled();

    for (const command of ["create", "delete", "setCompetitions"] as const) {
      const f = fixture([undefined, undefined]);
      await expect(
        invoke(
          command,
          f.tx,
          {
            ...base,
            kind: "judge",
            name: "Judge",
            phone: "+919876543211",
            competitionIds: [],
          },
          hospitalityLead
        )
      ).rejects.toThrow("Unauthorized");
      expect(f.insert).not.toHaveBeenCalled();
      expect(f.deleteAttendee).not.toHaveBeenCalled();
      expect(f.add).not.toHaveBeenCalled();
    }
  });

  it("cannot edit absent or foreign Guests or write in archived Editions", async () => {
    const f = authorizedUpdate(undefined);
    await expect(
      invoke("update", f.tx, { ...base, name: "Updated" }, hospitalityLead)
    ).rejects.toThrow("Active attendee");
    expect(f.update).not.toHaveBeenCalled();
    const targetScope = JSON.stringify(
      (f.tx.run.mock.calls[3]![0] as { ast: unknown }).ast
    );
    expect(targetScope).toContain(edition.id);
    expect(targetScope).toContain(base.id);
    const archived = fixture([], "archived");
    await expect(
      invoke(
        "create",
        archived.tx,
        { ...base, kind: "guest", name: "Guest", phone: "+919876543211" },
        hospitalityLead
      )
    ).rejects.toThrow("unavailable");
    expect(archived.tx.run).not.toHaveBeenCalled();
  });

  it("does not grant Guest writes to Hospitality Members or Guardian memberships", async () => {
    const f = fixture([undefined, undefined]);
    await expect(
      invoke("archive", f.tx, base, hospitalityLead)
    ).rejects.toThrow("Unauthorized");
    expect(f.update).not.toHaveBeenCalled();
    const scope = JSON.stringify(
      (f.tx.run.mock.calls[1]![0] as { ast: unknown }).ast
    );
    expect(scope).toContain("hospitality_lead");
    expect(scope).toContain("volunteer");
    expect(scope).not.toContain("hospitality_member");
  });
});

describe("Kalakriti attendee commands", () => {
  it.each(["attendee_check_in", "breakfast", "lunch"])(
    "preserves Judges with %s history",
    async (type) => {
      const f = fixture([
        person,
        { id: "operation-1", type, supersededAt: 99 },
      ]);
      await expect(invoke("delete", f.tx, base)).rejects.toThrow(
        "check-in or meal history"
      );
      expect(f.deleteAttendee).not.toHaveBeenCalled();
      expect(f.remove).not.toHaveBeenCalled();
      expect(f.audit).not.toHaveBeenCalled();
    }
  );
  it("allows admin deletion and does not lower an existing counter", async () => {
    const f = fixture([
      person,
      undefined,
      { ...edition, nextJudgeSequence: 20 },
      [],
    ]);
    await invoke("delete", f.tx, base);
    expect(f.deleteAttendee).toHaveBeenCalledWith({ id: person.id });
    expect(f.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextJudgeSequence: 20,
    });
  });
  it("replays deletion without another audit or counter update", async () => {
    const f = fixture([undefined]);
    await invoke("delete", f.tx, base);
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.updateEdition).not.toHaveBeenCalled();
  });
  it("rejects the old Judge archive command", async () => {
    const f = fixture([person]);
    await expect(invoke("archive", f.tx, base)).rejects.toThrow("Use Delete");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("allocates after legacy Judge rows when the counter is not initialized", async () => {
    const f = fixture([undefined, edition, [person]]);
    await invoke("create", f.tx, {
      ...base,
      kind: "judge",
      name: "Judge",
      phone: "+919876543211",
    });
    expect(f.insert).toHaveBeenCalledWith(
      expect.objectContaining({ humanId: "KALJ-2027-0010" })
    );
    expect(f.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextJudgeSequence: 11,
    });
  });
  it("validates identifiers, bounded timestamps, required names and international phone numbers", () => {
    const valid = {
      id: "019d52c2-7261-7dce-b0ee-e20656171601",
      editionId: "019d52c2-7261-7dce-b0ee-e20656171602",
      auditEntryId: "019d52c2-7261-7dce-b0ee-e20656171603",
      now: 1000,
      kind: "guest",
      name: "Guest",
      phone: " +919876543210 ",
    };
    expect(kalakritiAttendeeCreateSchema.parse(valid).phone).toBe(
      "+919876543210"
    );
    for (const invalid of [
      { name: " " },
      { phone: " " },
      { phone: "x" },
      { phone: "123" },
      { id: "not-uuid" },
      { now: Infinity },
      { now: -1 },
      { now: 0.5 },
    ]) {
      expect(
        kalakritiAttendeeCreateSchema.safeParse({ ...valid, ...invalid })
          .success
      ).toBe(false);
    }
  });
  it("allocates yearly IDs after archived rows under a live Edition lock", async () => {
    const f = fixture([
      undefined,
      edition,
      [{ humanId: "KALGT-2027-0009", archivedAt: 1 }],
    ]);
    await invoke("create", f.tx, {
      ...base,
      kind: "guest",
      name: "Guest",
      phone: "123",
    });
    expect(f.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        humanId: "KALGT-2027-0010",
        email: null,
        createdBy: "admin",
      })
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} })
    );
  });
  it("rejects archived Edition writes", async () => {
    const f = fixture([], "archived");
    await expect(invoke("archive", f.tx, base)).rejects.toThrow("unavailable");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("denies actors without an active Edition admin assignment", async () => {
    const f = fixture([undefined]);
    await expect(
      invoke("archive", f.tx, base, {
        ...admin,
        permissions: [],
        role: "volunteer",
      })
    ).rejects.toThrow("Unauthorized");
  });
  it("locks the Edition before checking administrator authority", async () => {
    const f = fixture([undefined]);
    await expect(
      invoke("archive", f.tx, base, {
        ...admin,
        permissions: [],
        role: "volunteer",
      })
    ).rejects.toThrow("Unauthorized");
    expect(f.order).toEqual(["edition-lock", "query", "query"]);
    expect(f.update).not.toHaveBeenCalled();
  });
  it("allows an active Edition administrator", async () => {
    const f = fixture([{ id: "membership-1" }, { ...person, kind: "guest" }]);
    await invoke("archive", f.tx, base, {
      ...admin,
      permissions: [],
      role: "volunteer",
    });
    expect(f.update).toHaveBeenCalledWith({
      id: base.id,
      archivedAt: base.now,
      updatedAt: base.now,
    });
  });
  it("rejects assigning competitions to guests", async () => {
    const f = fixture([{ ...person, kind: "guest" }]);
    await expect(
      invoke("setCompetitions", f.tx, {
        ...base,
        competitionIds: ["competition-1"],
      })
    ).rejects.toThrow("Active judge");
    expect(f.add).not.toHaveBeenCalled();
  });
  it("rejects absent, retired or cross-Edition competitions before changes", async () => {
    const f = fixture([person, undefined]);
    await expect(
      invoke("setCompetitions", f.tx, {
        ...base,
        competitionIds: ["wrong-edition"],
      })
    ).rejects.toThrow("Active competition");
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("deduplicates assignments and retains unchanged links", async () => {
    const f = fixture([
      person,
      { id: "competition-1" },
      { id: "competition-2" },
      [
        { id: "keep", competitionId: "competition-1" },
        { id: "remove", competitionId: "competition-3" },
      ],
    ]);
    await invoke("setCompetitions", f.tx, {
      ...base,
      competitionIds: ["competition-1", "competition-2", "competition-2"],
    });
    expect(f.add).toHaveBeenCalledTimes(1);
    expect(f.remove).toHaveBeenCalledWith({ id: "remove" });
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { addedCount: 1, removedCount: 1 } })
    );
  });
  it("archives without deleting operations or assignments and replays without audit", async () => {
    const f = fixture([{ ...person, kind: "guest", archivedAt: 42 }]);
    await invoke("archive", f.tx, base);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("does not optimistically allocate identifiers", async () => {
    const f = fixture([]);
    f.tx.location = "client";
    await invoke("create", f.tx, {
      ...base,
      kind: "guest",
      name: "Guest",
      phone: "123",
    });
    expect(f.tx.run).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
  });
});
