import { describe, expect, it, vi } from "vitest";
import { kalakritiEntryMutators } from "../kalakriti-entry";

const ctx = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};
const edition = {
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "registration_open",
  timezone: "Asia/Kolkata",
};
const center = {
  competitionEntryRegistrationEnabled: true,
  editionId: edition.id,
  id: "center-1",
  retiredAt: null,
  studentRegistrationEnabled: true,
};
const session = {
  ageCategoryId: "age-1",
  cancelledAt: null,
  capacity: 2,
  competitionId: "competition-1",
  editionId: edition.id,
  endAt: 200,
  id: "session-1",
  startAt: 100,
  venueId: "venue-1",
};
const student = {
  ageCategoryId: "age-1",
  ageCategoryOverrideAt: null,
  ageCategoryOverrideBy: null,
  ageCategoryOverrideReason: null,
  centerId: center.id,
  dateOfBirth: "2018-06-15",
  derivedAgeCategoryId: "age-1",
  editionId: edition.id,
  gender: "female" as const,
  humanId: "KAL-2027-0001",
  id: "student-1",
  name: "Ananya Rao",
  normalizedName: "ananya rao",
};
const ageCategory = {
  editionId: edition.id,
  id: "age-1",
  maxCompetitionsPerCategory: 2,
  maximumAge: 10,
  maxTotalCompetitions: 3,
  minimumAge: 6,
  name: "Junior",
};
const competition = {
  cancelledAt: null,
  competitionCategoryId: "category-1",
  genderEligibility: "both" as const,
  id: "competition-1",
  participationMode: "individual" as const,
  retiredAt: null,
};
const activeConfiguration = [
  competition,
  { id: "category-1", retiredAt: null },
  { id: "venue-1", retiredAt: null },
];
const createArgs = {
  auditEntryId: "audit-1",
  centerId: center.id,
  editionId: edition.id,
  entryId: "entry-1",
  memberId: "member-1",
  now: 1000,
  sessionId: session.id,
  studentId: student.id,
};

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    deleteEntry: vi.fn(),
    deleteMember: vi.fn(),
    insertAudit: vi.fn(),
    insertEntry: vi.fn(),
    insertMember: vi.fn(),
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
        kalakritiCompetitionEntry: {
          delete: spies.deleteEntry,
          insert: spies.insertEntry,
        },
        kalakritiEntryMember: {
          delete: spies.deleteMember,
          insert: spies.insertMember,
        },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

function createEntry({
  age = ageCategory,
  centerRow = center,
  editionRow = edition,
  existingMemberships = [],
  sessionEntries = [],
  sessionRow = session,
  studentRow = student,
  configuration = activeConfiguration,
}: {
  age?: typeof ageCategory;
  centerRow?: typeof center;
  editionRow?: typeof edition;
  existingMemberships?: unknown[];
  sessionEntries?: unknown[];
  sessionRow?: typeof session;
  studentRow?: typeof student;
  configuration?: unknown[];
} = {}) {
  const { lockedResults, spies, tx } = createTx([
    ...configuration,
    sessionEntries,
    existingMemberships,
  ]);
  lockedResults.push(
    [editionRow],
    [centerRow],
    [sessionRow],
    [studentRow],
    [age]
  );
  const promise = kalakritiEntryMutators.createIndividual.fn({
    args: createArgs,
    ctx,
    tx,
  } as unknown as Parameters<
    typeof kalakritiEntryMutators.createIndividual.fn
  >[0]);
  return { promise, spies };
}

describe("kalakritiEntry commands", () => {
  it("creates an immediately active individual Entry", async () => {
    const { promise, spies } = await createEntry();
    await promise;

    expect(spies.insertEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: center.id,
        editionId: edition.id,
        participationMode: "individual",
        sessionId: session.id,
      })
    );
    expect(spies.insertMember).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: createArgs.entryId,
        studentId: student.id,
      })
    );
  });

  it("rejects a stale submission after Center entry registration closes", async () => {
    const { promise, spies } = await createEntry({
      centerRow: { ...center, competitionEntryRegistrationEnabled: false },
    });

    await expect(promise).rejects.toThrow("closed for this Center");
    expect(spies.insertEntry).not.toHaveBeenCalled();
  });

  it("rejects a Student from another Center", async () => {
    const { promise } = await createEntry({
      studentRow: { ...student, centerId: "center-2" },
    });
    await expect(promise).rejects.toThrow(
      "not found in this Center and Edition"
    );
  });

  it("rejects an ineligible Age Category and gender", async () => {
    const wrongAge = await createEntry({
      sessionRow: { ...session, ageCategoryId: "age-2" },
    });
    await expect(wrongAge.promise).rejects.toThrow("Age Category");

    const wrongGender = await createEntry({
      configuration: [
        { ...competition, genderEligibility: "male" },
        activeConfiguration[1],
        activeConfiguration[2],
      ],
    });
    await expect(wrongGender.promise).rejects.toThrow("gender rule");
  });

  it("rejects group-mode Competitions", async () => {
    const { promise } = await createEntry({
      configuration: [
        { ...competition, participationMode: "group" },
        activeConfiguration[1],
        activeConfiguration[2],
      ],
    });
    await expect(promise).rejects.toThrow("requires a group Entry");
  });

  it("enforces Session capacity without creating a waitlist", async () => {
    const { promise, spies } = await createEntry({
      sessionEntries: [{ id: "entry-a" }, { id: "entry-b" }],
    });
    await expect(promise).rejects.toThrow("capacity is full");
    expect(spies.insertEntry).not.toHaveBeenCalled();
  });

  it("enforces one Entry per Student and Session", async () => {
    const { promise } = await createEntry({
      existingMemberships: [{ sessionId: session.id }],
    });
    await expect(promise).rejects.toThrow(
      "already registered for this Session"
    );
  });

  it("enforces total and per-category Competition limits", async () => {
    const membership = (id: string, categoryId: string) => ({
      entry: {
        session: {
          competition: { competitionCategoryId: categoryId },
          endAt: 20,
          id,
          startAt: 10,
        },
      },
      entryId: `entry-${id}`,
      id: `member-${id}`,
      sessionId: id,
    });
    const total = await createEntry({
      existingMemberships: [
        membership("a", "other-1"),
        membership("b", "other-2"),
        membership("c", "other-3"),
      ],
    });
    await expect(total.promise).rejects.toThrow("total Competition limit");

    const category = await createEntry({
      existingMemberships: [
        membership("a", "category-1"),
        membership("b", "category-1"),
      ],
    });
    await expect(category.promise).rejects.toThrow(
      "Competition Category limit"
    );
  });

  it("rejects overlapping Sessions with no administrator override", async () => {
    const { promise } = await createEntry({
      existingMemberships: [
        {
          entry: {
            session: {
              competition: { competitionCategoryId: "other" },
              endAt: 150,
              id: "other-session",
              startAt: 50,
            },
          },
          entryId: "other-entry",
          id: "other-member",
          sessionId: "other-session",
        },
      ],
    });
    await expect(promise).rejects.toThrow("overlapping Session");
  });

  it("removes an individual Entry only while registration remains writable", async () => {
    const snapshot = {
      centerId: center.id,
      editionId: edition.id,
      members: [{ id: "member-1", studentId: student.id }],
      participationMode: "individual",
      sessionId: session.id,
    };
    const { lockedResults, spies, tx } = createTx([snapshot, snapshot]);
    lockedResults.push([edition], [center], [session]);

    await kalakritiEntryMutators.remove.fn({
      args: { auditEntryId: "audit-1", entryId: "entry-1", now: 1000 },
      ctx,
      tx,
    } as unknown as Parameters<typeof kalakritiEntryMutators.remove.fn>[0]);

    expect(spies.deleteMember).toHaveBeenCalledWith({ id: "member-1" });
    expect(spies.deleteEntry).toHaveBeenCalledWith({ id: "entry-1" });
  });
});
