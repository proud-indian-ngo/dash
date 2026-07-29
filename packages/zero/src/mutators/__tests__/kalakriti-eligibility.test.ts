import { describe, expect, it, vi } from "vitest";
import { kalakritiEligibilityMutators } from "../kalakriti-eligibility";

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
  maximumAge: 10,
  minimumAge: 6,
  name: "Junior",
};
function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    deleteAgeCategory: vi.fn(),
    insertAgeCategory: vi.fn(),
    insertAudit: vi.fn(),
    lockRows: vi.fn(),
    updateAgeCategory: vi.fn(),
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
        kalakritiAgeCategory: {
          delete: spies.deleteAgeCategory,
          insert: spies.insertAgeCategory,
          update: spies.updateAgeCategory,
        },
        kalakritiAuditEntry: { insert: spies.insertAudit },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

describe("kalakritiEligibility commands", () => {
  it("creates a normalized non-overlapping Age Category", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([edition], []);

    await kalakritiEligibilityMutators.createAgeCategory.fn({
      args: {
        ageCategoryId: "category-1",
        auditEntryId: "audit-1",
        editionId: "edition-1",
        femaleStudentLimit: 20,
        maleStudentLimit: 20,
        maxCompetitionsPerCategory: 1,
        maximumAge: 10,
        maxTotalCompetitions: 2,
        minimumAge: 6,
        name: "  Junior  ",
        now: 1,
        sortOrder: 0,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiEligibilityMutators.createAgeCategory.fn
    >[0]);

    expect(spies.insertAgeCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        femaleStudentLimit: 20,
        maleStudentLimit: 20,
        name: "Junior",
        normalizedName: "junior",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "age_category_configuration" })
    );
  });

  it("rejects inclusive range overlap before writing", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([edition], [category]);

    await expect(
      kalakritiEligibilityMutators.createAgeCategory.fn({
        args: {
          ageCategoryId: "category-2",
          auditEntryId: "audit-2",
          editionId: "edition-1",
          femaleStudentLimit: 20,
          maleStudentLimit: 20,
          maxCompetitionsPerCategory: 1,
          maximumAge: 12,
          maxTotalCompetitions: 2,
          minimumAge: 10,
          name: "Senior",
          now: 1,
          sortOrder: 1,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiEligibilityMutators.createAgeCategory.fn
      >[0])
    ).rejects.toThrow("Age ranges overlap");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
  });

  it("allows an Edition Administrator to create an Age Category", async () => {
    const { lockedResults, spies, tx } = createTx([
      { id: "membership-1" },
      { id: "assignment-1" },
    ]);
    lockedResults.push([edition], []);

    await kalakritiEligibilityMutators.createAgeCategory.fn({
      args: {
        ageCategoryId: "category-2",
        auditEntryId: "audit-2",
        editionId: "edition-1",
        femaleStudentLimit: 24,
        maleStudentLimit: 24,
        maxCompetitionsPerCategory: 1,
        maximumAge: 15,
        maxTotalCompetitions: 2,
        minimumAge: 11,
        name: "Senior",
        now: 1,
        sortOrder: 1,
      },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "edition-admin-1",
      },
      tx,
    } as unknown as Parameters<
      typeof kalakritiEligibilityMutators.createAgeCategory.fn
    >[0]);

    expect(spies.insertAgeCategory).toHaveBeenCalledOnce();
  });

  it("rejects configuration changes from an unassigned user", async () => {
    const { lockedResults, spies, tx } = createTx([undefined]);
    lockedResults.push([edition]);

    await expect(
      kalakritiEligibilityMutators.createAgeCategory.fn({
        args: {
          ageCategoryId: "category-2",
          auditEntryId: "audit-2",
          editionId: "edition-1",
          femaleStudentLimit: 24,
          maleStudentLimit: 24,
          maxCompetitionsPerCategory: 1,
          maximumAge: 15,
          maxTotalCompetitions: 2,
          minimumAge: 11,
          name: "Senior",
          now: 1,
          sortOrder: 1,
        },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "ordinary-1",
        },
        tx,
      } as unknown as Parameters<
        typeof kalakritiEligibilityMutators.createAgeCategory.fn
      >[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertAgeCategory).not.toHaveBeenCalled();
  });

  it.each(["live", "archived"])(
    "rejects configuration changes while the Edition is %s",
    async (lifecycle) => {
      const { lockedResults, spies, tx } = createTx();
      lockedResults.push([{ ...edition, lifecycle }]);

      await expect(
        kalakritiEligibilityMutators.createAgeCategory.fn({
          args: {
            ageCategoryId: "category-2",
            auditEntryId: "audit-2",
            editionId: "edition-1",
            femaleStudentLimit: 24,
            maleStudentLimit: 24,
            maxCompetitionsPerCategory: 1,
            maximumAge: 15,
            maxTotalCompetitions: 2,
            minimumAge: 11,
            name: "Senior",
            now: 1,
            sortOrder: 1,
          },
          ctx: adminContext,
          tx,
        } as unknown as Parameters<
          typeof kalakritiEligibilityMutators.createAgeCategory.fn
        >[0])
      ).rejects.toThrow("Configuration cannot be changed");
      expect(spies.insertAgeCategory).not.toHaveBeenCalled();
    }
  );

  it("updates an Age Category while excluding its current range", async () => {
    const { lockedResults, spies, tx } = createTx([{ editionId: "edition-1" }]);
    lockedResults.push([edition], [category], [category]);

    await kalakritiEligibilityMutators.updateAgeCategory.fn({
      args: {
        ageCategoryId: category.id,
        auditEntryId: "audit-1",
        femaleStudentLimit: 25,
        maleStudentLimit: 20,
        maxCompetitionsPerCategory: 2,
        maximumAge: 11,
        maxTotalCompetitions: 3,
        minimumAge: 6,
        name: "Junior Plus",
        now: 2,
        sortOrder: 0,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiEligibilityMutators.updateAgeCategory.fn
    >[0]);

    expect(spies.updateAgeCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        femaleStudentLimit: 25,
        id: category.id,
        maleStudentLimit: 20,
        maximumAge: 11,
        name: "Junior Plus",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "updated" })
    );
  });

  it("rejects an Age Category edit that overlaps another category", async () => {
    const senior = {
      editionId: "edition-1",
      id: "category-2",
      maximumAge: 15,
      minimumAge: 11,
      name: "Senior",
    };
    const { lockedResults, spies, tx } = createTx([{ editionId: "edition-1" }]);
    lockedResults.push([edition], [category], [category, senior]);

    await expect(
      kalakritiEligibilityMutators.updateAgeCategory.fn({
        args: {
          ageCategoryId: category.id,
          auditEntryId: "audit-1",
          femaleStudentLimit: 20,
          maleStudentLimit: 20,
          maxCompetitionsPerCategory: 1,
          maximumAge: 12,
          maxTotalCompetitions: 2,
          minimumAge: 6,
          name: "Junior",
          now: 2,
          sortOrder: 0,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiEligibilityMutators.updateAgeCategory.fn
      >[0])
    ).rejects.toThrow("Age ranges overlap");
    expect(spies.updateAgeCategory).not.toHaveBeenCalled();
  });
});
