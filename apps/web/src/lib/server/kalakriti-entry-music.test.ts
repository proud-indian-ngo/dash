import { beforeEach, describe, expect, it, mock } from "bun:test";

const tables = {
  kalakritiEdition: { findFirst: mock() },
  kalakritiCenter: { findFirst: mock() },
  kalakritiCompetitionDivision: { findFirst: mock() },
  kalakritiCompetitionEntry: { findFirst: mock() },
  kalakritiCompetition: { findFirst: mock() },
  kalakritiCompetitionCategory: { findFirst: mock() },
  kalakritiEditionMembership: { findFirst: mock() },
  kalakritiAssignment: { findFirst: mock() },
  kalakritiGuardianCenter: { findFirst: mock() },
};
const permissions = mock();
mock.module("@pi-dash/db", () => ({ db: { query: tables } }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: permissions,
}));
mock.module("@/lib/server/kalakriti-registration-scope", () => ({
  resolveKalakritiRegistrationScope: mock(),
}));

import { authorizeKalakritiEntryMusicUpload } from "./kalakriti-entry-music";

const input = {
  centerId: "center",
  divisionId: "division",
  editionId: "edition",
  entryId: "entry",
  user: { id: "user", role: "admin" },
};
const competition = {
  editionId: "edition",
  competitionCategoryId: "category",
  musicUploadEnabled: true,
  cancelledAt: null,
  retiredAt: null,
};

beforeEach(() => {
  for (const table of Object.values(tables)) table.findFirst.mockReset();
  permissions.mockReset();
  permissions.mockResolvedValue(["kalakriti.admin"]);
  tables.kalakritiEdition.findFirst.mockResolvedValue({
    id: "edition",
    lifecycle: "registration_locked",
  });
  tables.kalakritiCenter.findFirst.mockResolvedValue({
    editionId: "edition",
    retiredAt: null,
    competitionEntryRegistrationEnabled: false,
  });
  tables.kalakritiCompetitionDivision.findFirst.mockResolvedValue({
    editionId: "edition",
    competitionId: "competition",
  });
  tables.kalakritiCompetitionEntry.findFirst.mockResolvedValue({
    editionId: "edition",
    centerId: "center",
    divisionId: "division",
  });
  tables.kalakritiCompetition.findFirst.mockResolvedValue(competition);
  tables.kalakritiCompetitionCategory.findFirst.mockResolvedValue({
    editionId: "edition",
    retiredAt: null,
  });
});

describe("existing Entry music upload authorization", () => {
  it.each([
    "draft",
    "registration_open",
    "registration_locked",
    "live",
    "completed",
  ])(
    "allows existing-entry upload in %s with registration disabled",
    async (lifecycle) => {
      tables.kalakritiEdition.findFirst.mockResolvedValue({
        id: "edition",
        lifecycle,
      });
      await expect(
        authorizeKalakritiEntryMusicUpload(input)
      ).resolves.toBeUndefined();
    }
  );

  it("rejects archived Editions", async () => {
    tables.kalakritiEdition.findFirst.mockResolvedValue({
      id: "edition",
      lifecycle: "archived",
    });
    await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
      "Forbidden"
    );
  });

  it.each([
    undefined,
    { editionId: "other", centerId: "center", divisionId: "division" },
    { editionId: "edition", centerId: "other", divisionId: "division" },
    { editionId: "edition", centerId: "center", divisionId: "other" },
  ])(
    "requires an existing entry matching all supplied scope IDs",
    async (entry) => {
      tables.kalakritiCompetitionEntry.findFirst.mockResolvedValue(entry);
      await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
        "Not found"
      );
    }
  );

  it.each([
    { musicUploadEnabled: false },
    { cancelledAt: 1 },
    { retiredAt: 1 },
    { editionId: "other" },
  ])(
    "rejects disabled or inactive/cross-edition Competition",
    async (patch) => {
      tables.kalakritiCompetition.findFirst.mockResolvedValue({
        ...competition,
        ...patch,
      });
      await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
        "Forbidden"
      );
    }
  );

  it("rejects retired Centers and categories", async () => {
    tables.kalakritiCenter.findFirst.mockResolvedValue({
      editionId: "edition",
      retiredAt: 1,
    });
    await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
      "Forbidden"
    );
    tables.kalakritiCenter.findFirst.mockResolvedValue({
      editionId: "edition",
      retiredAt: null,
    });
    tables.kalakritiCompetitionCategory.findFirst.mockResolvedValue({
      editionId: "edition",
      retiredAt: 1,
    });
    await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
      "Forbidden"
    );
  });

  it("allows only assigned Guardians at closed Centers", async () => {
    permissions.mockResolvedValue(["kalakriti.view"]);
    tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
      id: "membership",
      kind: "guardian",
    });
    tables.kalakritiGuardianCenter.findFirst.mockResolvedValue({
      id: "guardian-center",
    });
    await expect(
      authorizeKalakritiEntryMusicUpload(input)
    ).resolves.toBeUndefined();
    tables.kalakritiGuardianCenter.findFirst.mockResolvedValue(undefined);
    await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
      "Forbidden"
    );
  });

  it("allows scoped liaison or Edition administrators, not unrelated members", async () => {
    permissions.mockResolvedValue(["kalakriti.view"]);
    tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
      id: "membership",
      kind: "volunteer",
    });
    tables.kalakritiAssignment.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "liaison" });
    await expect(
      authorizeKalakritiEntryMusicUpload(input)
    ).resolves.toBeUndefined();
    tables.kalakritiAssignment.findFirst.mockResolvedValue({
      id: "edition-admin",
    });
    await expect(
      authorizeKalakritiEntryMusicUpload(input)
    ).resolves.toBeUndefined();
    tables.kalakritiAssignment.findFirst.mockResolvedValue(undefined);
    await expect(authorizeKalakritiEntryMusicUpload(input)).rejects.toThrow(
      "Forbidden"
    );
  });

  it("does not open pre-registration signing without entryId", async () => {
    await expect(
      authorizeKalakritiEntryMusicUpload({ ...input, entryId: undefined })
    ).rejects.toThrow("Forbidden");
    tables.kalakritiEdition.findFirst.mockResolvedValue({
      id: "edition",
      lifecycle: "registration_open",
    });
    await expect(
      authorizeKalakritiEntryMusicUpload({ ...input, entryId: undefined })
    ).rejects.toThrow("Forbidden");
    tables.kalakritiCenter.findFirst.mockResolvedValue({
      editionId: "edition",
      retiredAt: null,
      competitionEntryRegistrationEnabled: true,
    });
    await expect(
      authorizeKalakritiEntryMusicUpload({ ...input, entryId: undefined })
    ).resolves.toBeUndefined();
  });
});
