import { describe, expect, it, vi } from "vitest";
import { kalakritiStudentMutators } from "../kalakriti-student";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};
const scopedContext = {
  permissions: ["kalakriti.view"],
  role: "external_user",
  userId: "guardian-1",
};
const edition = {
  ageCutoffDate: "2027-06-30",
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "registration_open",
  nextStudentSequence: 12,
  timezone: "Asia/Kolkata",
  year: 2027,
};
const center = {
  competitionEntryRegistrationEnabled: false,
  editionId: edition.id,
  id: "center-1",
  retiredAt: null,
  studentRegistrationEnabled: true,
};
const junior = {
  editionId: edition.id,
  id: "junior-1",
  maximumAge: 10,
  minimumAge: 6,
  name: "Junior",
};
const senior = {
  editionId: edition.id,
  id: "senior-1",
  maximumAge: 15,
  minimumAge: 11,
  name: "Senior",
};
const student = {
  ageCategoryId: junior.id,
  ageCategoryOverrideAt: null,
  ageCategoryOverrideBy: null,
  ageCategoryOverrideReason: null,
  centerId: center.id,
  dateOfBirth: "2018-06-15",
  derivedAgeCategoryId: junior.id,
  editionId: edition.id,
  gender: "female" as const,
  humanId: "KAL-2027-0011",
  id: "student-1",
  name: "Ananya Rao",
  normalizedName: "ananya rao",
};
const quota = { femaleStudentLimit: 2, maleStudentLimit: 2 };
const tokenHash = "a".repeat(64);

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    deleteCredential: vi.fn(),
    deleteEntry: vi.fn(),
    deleteEntryMember: vi.fn(),
    deleteStudent: vi.fn(),
    insertAudit: vi.fn(),
    insertCredential: vi.fn(),
    insertStudent: vi.fn(),
    lockRows: vi.fn(),
    updateEdition: vi.fn(),
    updateStudent: vi.fn(),
  };
  const select = vi.fn(() => {
    const query = {
      for: vi.fn(() => {
        const rows = lockedResults.shift() ?? [];
        spies.lockRows(rows);
        return rows;
      }),
      from: vi.fn(),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
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
        kalakritiCompetitionEntry: { delete: spies.deleteEntry },
        kalakritiCredential: {
          delete: spies.deleteCredential,
          insert: spies.insertCredential,
        },
        kalakritiEdition: { update: spies.updateEdition },
        kalakritiEntryMember: { delete: spies.deleteEntryMember },
        kalakritiStudent: {
          delete: spies.deleteStudent,
          insert: spies.insertStudent,
          update: spies.updateStudent,
        },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

const createArgs: {
  ageCategoryOverrideId: string | null;
  ageCategoryOverrideReason: string | null;
  auditEntryId: string;
  centerId: string;
  credentialId: string;
  credentialTokenHash: string;
  dateOfBirth: string;
  duplicateConfirmed: boolean;
  editionId: string;
  gender: "female" | "male";
  name: string;
  now: number;
  studentId: string;
} = {
  ageCategoryOverrideId: null,
  ageCategoryOverrideReason: null,
  auditEntryId: "audit-1",
  centerId: center.id,
  credentialId: "credential-1",
  credentialTokenHash: tokenHash,
  dateOfBirth: "2018-06-15",
  duplicateConfirmed: false,
  editionId: edition.id,
  gender: "female" as const,
  name: "  Ananya   Rao  ",
  now: 1000,
  studentId: "student-1",
};

async function createStudent(
  tx: ReturnType<typeof createTx>["tx"],
  args: typeof createArgs = createArgs,
  ctx: typeof adminContext | typeof scopedContext = adminContext
) {
  await kalakritiStudentMutators.create.fn({
    args,
    ctx,
    tx,
  } as unknown as Parameters<typeof kalakritiStudentMutators.create.fn>[0]);
}

describe("kalakritiStudent commands", () => {
  it("creates a Student with a stable yearly ID and one active Credential", async () => {
    const { lockedResults, spies, tx } = createTx([[], quota, []]);
    lockedResults.push([edition], [center], [junior, senior]);

    await createStudent(tx);

    expect(spies.insertStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        ageCategoryId: junior.id,
        dateOfBirth: Date.UTC(2018, 5, 15),
        humanId: "KAL-2027-0012",
        name: "Ananya Rao",
        normalizedName: "ananya rao",
      })
    );
    expect(spies.insertCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        humanId: "KAL-2027-0012",
        revokedAt: null,
        studentId: "student-1",
        tokenHash,
      })
    );
    expect(spies.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextStudentSequence: 13,
    });
  });

  it("allows a Guardian only for an explicitly assigned Center", async () => {
    const membership = { id: "membership-1", kind: "guardian" };
    const { lockedResults, spies, tx } = createTx([
      membership,
      undefined,
      { id: "guardian-center-1" },
      [],
      quota,
      [],
      [],
    ]);
    lockedResults.push([edition], [center], [junior]);

    await createStudent(tx, createArgs, scopedContext);
    expect(spies.insertStudent).toHaveBeenCalledOnce();
  });

  it("rejects an unassigned Guardian", async () => {
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1", kind: "guardian" },
      undefined,
      undefined,
    ]);
    lockedResults.push([edition], [center]);

    await expect(createStudent(tx, createArgs, scopedContext)).rejects.toThrow(
      "Unauthorized for this Center"
    );
    expect(spies.insertStudent).not.toHaveBeenCalled();
  });

  it("accepts only an explicit Liaison assignment for a volunteer", async () => {
    const liaisonContext = {
      permissions: ["kalakriti.view"],
      role: "volunteer",
      userId: "liaison-1",
    };
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1", kind: "volunteer" },
      undefined,
      { id: "liaison-assignment-1" },
      [],
      quota,
      [],
      [],
      [],
    ]);
    lockedResults.push([edition], [center], [junior]);

    await createStudent(tx, createArgs, liaisonContext);
    expect(spies.insertStudent).toHaveBeenCalledOnce();
  });

  it("does not treat another Center responsibility as registration access", async () => {
    const transportContext = {
      permissions: ["kalakriti.view"],
      role: "volunteer",
      userId: "transport-1",
    };
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1", kind: "volunteer" },
      undefined,
      undefined,
    ]);
    lockedResults.push([edition], [center]);

    await expect(
      createStudent(tx, createArgs, transportContext)
    ).rejects.toThrow("Unauthorized for this Center");
    expect(spies.insertStudent).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...edition, lifecycle: "registration_locked" }, center],
    [edition, { ...center, studentRegistrationEnabled: false }],
  ])(
    "checks Edition and Center registration controls on create",
    async (e, c) => {
      const { lockedResults, spies, tx } = createTx();
      lockedResults.push([e], [c]);

      await expect(createStudent(tx)).rejects.toThrow("registration");
      expect(spies.insertStudent).not.toHaveBeenCalled();
    }
  );

  it("rejects an incomplete optimistic Edition registration row", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push(
      [
        {
          eventDate: edition.eventDate,
          id: edition.id,
          lifecycle: edition.lifecycle,
          timezone: edition.timezone,
        },
      ],
      [center]
    );

    await expect(createStudent(tx)).rejects.toThrow(
      "Edition registration data is incomplete"
    );
    expect(spies.insertStudent).not.toHaveBeenCalled();
  });

  it("rejects a registration when the gender quota is full", async () => {
    const { lockedResults, spies, tx } = createTx([
      [],
      { ...quota, femaleStudentLimit: 1 },
      [{ id: "existing-1" }],
    ]);
    lockedResults.push([edition], [center], [junior]);

    await expect(createStudent(tx)).rejects.toThrow("quota is full");
    expect(spies.insertStudent).not.toHaveBeenCalled();
  });

  it("requires administrator confirmation for a same-Center duplicate", async () => {
    const { lockedResults, spies, tx } = createTx([
      [{ humanId: "KAL-2027-0002", id: "existing-1" }],
    ]);
    lockedResults.push([edition], [center], [junior]);

    await expect(createStudent(tx)).rejects.toThrow(
      "administrator confirmation is required"
    );
    expect(spies.insertStudent).not.toHaveBeenCalled();
  });

  it("records an administrator-confirmed duplicate exception", async () => {
    const { lockedResults, spies, tx } = createTx([
      [{ humanId: "KAL-2027-0002", id: "existing-1" }],
      quota,
      [],
    ]);
    lockedResults.push([edition], [center], [junior]);

    await createStudent(tx, { ...createArgs, duplicateConfirmed: true });
    expect(spies.insertStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateConfirmedAt: 1000,
        duplicateConfirmedBy: adminContext.userId,
      })
    );
  });

  it("requires and audits an administrator Age Category override reason", async () => {
    const { lockedResults, spies, tx } = createTx([[], quota, []]);
    lockedResults.push([edition], [center], [junior, senior]);

    await createStudent(tx, {
      ...createArgs,
      ageCategoryOverrideId: senior.id,
      ageCategoryOverrideReason: "  Approved after school record review  ",
    });

    expect(spies.insertStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        ageCategoryId: senior.id,
        ageCategoryOverrideBy: adminContext.userId,
        ageCategoryOverrideReason: "Approved after school record review",
        derivedAgeCategoryId: junior.id,
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Approved after school record review",
      })
    );
  });

  it("updates registration data without changing the human ID or Credential", async () => {
    const { lockedResults, spies, tx } = createTx([
      { centerId: center.id, editionId: edition.id },
      [],
      quota,
      [],
      [],
      [],
    ]);
    lockedResults.push([edition], [center], [junior], [student]);

    await kalakritiStudentMutators.update.fn({
      args: {
        ageCategoryOverrideId: null,
        ageCategoryOverrideReason: null,
        auditEntryId: "audit-2",
        dateOfBirth: student.dateOfBirth,
        duplicateConfirmed: false,
        gender: student.gender,
        name: "Ananya Rao Updated",
        now: 2000,
        studentId: student.id,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiStudentMutators.update.fn>[0]);

    expect(spies.updateStudent).toHaveBeenCalledWith(
      expect.not.objectContaining({ humanId: expect.anything() })
    );
    expect(spies.insertCredential).not.toHaveBeenCalled();
    expect(spies.deleteCredential).not.toHaveBeenCalled();
  });

  it("preserves an administrator override during a Liaison name edit", async () => {
    const overriddenStudent = {
      ...student,
      ageCategoryId: senior.id,
      ageCategoryOverrideAt: 500,
      ageCategoryOverrideBy: "admin-1",
      ageCategoryOverrideReason: "School record review",
    };
    const liaisonContext = {
      permissions: ["kalakriti.view"],
      role: "volunteer",
      userId: "liaison-1",
    };
    const { lockedResults, spies, tx } = createTx([
      { centerId: center.id, editionId: edition.id },
      { id: "membership-1", kind: "volunteer" },
      undefined,
      { id: "liaison-assignment-1" },
      [],
      quota,
      [],
      [],
    ]);
    lockedResults.push(
      [edition],
      [center],
      [junior, senior],
      [overriddenStudent]
    );

    await kalakritiStudentMutators.update.fn({
      args: {
        ageCategoryOverrideId: senior.id,
        ageCategoryOverrideReason: "School record review",
        auditEntryId: "audit-override-edit",
        dateOfBirth: overriddenStudent.dateOfBirth,
        duplicateConfirmed: false,
        gender: overriddenStudent.gender,
        name: "Ananya Rao Updated",
        now: 2000,
        studentId: overriddenStudent.id,
      },
      ctx: liaisonContext,
      tx,
    } as unknown as Parameters<typeof kalakritiStudentMutators.update.fn>[0]);

    expect(spies.updateStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        ageCategoryId: senior.id,
        ageCategoryOverrideAt: 500,
        ageCategoryOverrideBy: "admin-1",
        ageCategoryOverrideReason: "School record review",
      })
    );
  });

  it("preserves override attribution during an unrelated administrator edit", async () => {
    const overriddenStudent = {
      ...student,
      ageCategoryId: senior.id,
      ageCategoryOverrideAt: 500,
      ageCategoryOverrideBy: "admin-1",
      ageCategoryOverrideReason: "School record review",
    };
    const { lockedResults, spies, tx } = createTx([
      { centerId: center.id, editionId: edition.id },
      [],
      quota,
      [],
      [],
    ]);
    lockedResults.push(
      [edition],
      [center],
      [junior, senior],
      [overriddenStudent]
    );

    await kalakritiStudentMutators.update.fn({
      args: {
        ageCategoryOverrideId: senior.id,
        ageCategoryOverrideReason: "School record review",
        auditEntryId: "audit-admin-override-edit",
        dateOfBirth: overriddenStudent.dateOfBirth,
        duplicateConfirmed: false,
        gender: overriddenStudent.gender,
        name: "Ananya Rao Updated",
        now: 2000,
        studentId: overriddenStudent.id,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiStudentMutators.update.fn>[0]);

    expect(spies.updateStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        ageCategoryOverrideAt: 500,
        ageCategoryOverrideBy: "admin-1",
      })
    );
  });

  it("hard-deletes the Student and its Credential while retaining audit evidence", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        centerId: center.id,
        editionId: edition.id,
        humanId: student.humanId,
        name: student.name,
      },
      [{ id: "credential-1" }],
      [],
    ]);
    lockedResults.push([edition], [center], [junior], [student]);

    await kalakritiStudentMutators.delete.fn({
      args: { auditEntryId: "audit-3", now: 3000, studentId: student.id },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiStudentMutators.delete.fn>[0]);

    expect(spies.deleteCredential).toHaveBeenCalledWith({ id: "credential-1" });
    expect(spies.deleteStudent).toHaveBeenCalledWith({ id: student.id });
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "deleted",
        metadata: { humanId: student.humanId, name: student.name },
      })
    );
  });

  it("deletes the Student's Competition Entries before deleting the Student", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        centerId: center.id,
        editionId: edition.id,
        humanId: student.humanId,
        name: student.name,
      },
      [{ id: "credential-1" }],
      [
        {
          entry: {
            id: "entry-1",
            members: [{ id: "member-1" }, { id: "member-2" }],
          },
          id: "member-1",
        },
      ],
    ]);
    lockedResults.push([edition], [center], [junior], [student]);

    await kalakritiStudentMutators.delete.fn({
      args: { auditEntryId: "audit-3", now: 3000, studentId: student.id },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiStudentMutators.delete.fn>[0]);

    expect(spies.deleteEntryMember).toHaveBeenCalledTimes(2);
    expect(spies.deleteEntry).toHaveBeenCalledWith({ id: "entry-1" });
    expect(spies.deleteStudent).toHaveBeenCalledWith({ id: student.id });
  });

  it("blocks Student changes that would invalidate Competition Entries", async () => {
    const ageChange = createTx([
      { centerId: center.id, editionId: edition.id },
      [],
      quota,
      [],
      [
        {
          entry: {
            id: "entry-1",
            members: [{ id: "member-1" }],
            session: {
              ageCategoryId: junior.id,
              competition: { genderEligibility: "both" },
            },
          },
          id: "member-1",
        },
      ],
    ]);
    ageChange.lockedResults.push(
      [edition],
      [center],
      [junior, senior],
      [student]
    );

    await expect(
      kalakritiStudentMutators.update.fn({
        args: {
          ageCategoryOverrideId: senior.id,
          ageCategoryOverrideReason: "School record review",
          auditEntryId: "audit-age-change",
          dateOfBirth: student.dateOfBirth,
          duplicateConfirmed: false,
          gender: student.gender,
          name: student.name,
          now: 2000,
          studentId: student.id,
        },
        ctx: adminContext,
        tx: ageChange.tx,
      } as unknown as Parameters<typeof kalakritiStudentMutators.update.fn>[0])
    ).rejects.toThrow("would invalidate a Competition Entry");
    expect(ageChange.spies.updateStudent).not.toHaveBeenCalled();

    const genderChange = createTx([
      { centerId: center.id, editionId: edition.id },
      [],
      quota,
      [],
      [
        {
          entry: {
            id: "entry-1",
            members: [{ id: "member-1" }],
            session: {
              ageCategoryId: junior.id,
              competition: { genderEligibility: "female" },
            },
          },
          id: "member-1",
        },
      ],
    ]);
    genderChange.lockedResults.push([edition], [center], [junior], [student]);

    await expect(
      kalakritiStudentMutators.update.fn({
        args: {
          ageCategoryOverrideId: null,
          ageCategoryOverrideReason: null,
          auditEntryId: "audit-gender-change",
          dateOfBirth: student.dateOfBirth,
          duplicateConfirmed: false,
          gender: "male",
          name: student.name,
          now: 2000,
          studentId: student.id,
        },
        ctx: adminContext,
        tx: genderChange.tx,
      } as unknown as Parameters<typeof kalakritiStudentMutators.update.fn>[0])
    ).rejects.toThrow("would invalidate a Competition Entry");
    expect(genderChange.spies.updateStudent).not.toHaveBeenCalled();
  });
});
