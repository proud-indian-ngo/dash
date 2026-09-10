import { beforeEach, describe, expect, it, mock } from "bun:test";

import { PgDialect } from "drizzle-orm/pg-core";

import type { KalakritiRegistrationScope } from "@/lib/kalakriti-registration-scope-policy";

const tables = {
  kalakritiEdition: { findFirst: mock() },
  kalakritiCenter: { findFirst: mock() },
  kalakritiCompetitionDivision: { findFirst: mock() },
  kalakritiCompetitionEntry: { findFirst: mock() },
  kalakritiEntryMusic: { findFirst: mock() },
  kalakritiCompetition: { findFirst: mock() },
  kalakritiCompetitionCategory: { findFirst: mock() },
  kalakritiEditionMembership: { findFirst: mock() },
  kalakritiAssignment: { findFirst: mock() },
  kalakritiGuardianCenter: { findFirst: mock() },
};
const permissions = mock();
const resolveScope = mock();
mock.module("@pi-dash/db", () => ({ db: { query: tables } }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: permissions,
}));
mock.module("@/lib/server/kalakriti-registration-scope", () => ({
  resolveKalakritiRegistrationScope: resolveScope,
}));

import {
  authorizeKalakritiEntryMusicUpload,
  canReadKalakritiEntryMusic,
  loadKalakritiEntryMusicRecord,
} from "./kalakriti-entry-music";

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
  resolveScope.mockReset();
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

describe("per-file music download authorization", () => {
  const record = {
    centerId: "center",
    competitionCategoryId: "category",
    competitionId: "competition",
    editionYear: 2166,
    filename: "second.m4a",
    key: "legacy-prefix/kalakriti-music/edition/entry/second.m4a",
  };

  beforeEach(() => {
    tables.kalakritiEntryMusic.findFirst.mockResolvedValue({
      id: "music-2",
      entryId: "entry",
      editionId: "edition",
      fileName: record.filename,
      objectKey: record.key,
    });
    tables.kalakritiEdition.findFirst.mockResolvedValue({ year: 2166 });
  });

  it("resolves the exact child, preserves its legacy object key and scopes its parent", async () => {
    expect(await loadKalakritiEntryMusicRecord("music-2")).toEqual(record);
    const dialect = new PgDialect();
    const fileQuery =
      tables.kalakritiEntryMusic.findFirst.mock.calls.at(0)?.[0];
    const entryQuery =
      tables.kalakritiCompetitionEntry.findFirst.mock.calls.at(0)?.[0];
    if (!(fileQuery && entryQuery))
      throw new Error("Expected child and parent queries");
    expect(dialect.sqlToQuery(fileQuery.where).params).toEqual(["music-2"]);
    expect(dialect.sqlToQuery(entryQuery.where).params).toEqual([
      "entry",
      "edition",
    ]);
  });

  it("does not fall back to a singleton for a missing or deleted child", async () => {
    tables.kalakritiEntryMusic.findFirst.mockResolvedValue(undefined);
    expect(await loadKalakritiEntryMusicRecord("entry")).toBeNull();
    expect(tables.kalakritiCompetitionEntry.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    "kalakritiCompetitionEntry",
    "kalakritiEdition",
    "kalakritiCompetitionDivision",
    "kalakritiCompetition",
  ] as const)("fails closed when %s is absent", async (table) => {
    tables[table].findFirst.mockResolvedValue(undefined);
    expect(await loadKalakritiEntryMusicRecord("music-2")).toBeNull();
  });

  it("keeps persisted playback available when new uploads are disabled", async () => {
    tables.kalakritiCompetition.findFirst.mockResolvedValue({
      ...competition,
      musicUploadEnabled: false,
    });
    expect(await loadKalakritiEntryMusicRecord("music-2")).toEqual(record);
  });

  const allowedScopes: KalakritiRegistrationScope[] = [
    { kind: "edition" },
    { kind: "center", centerIds: ["center"] },
    { kind: "competition_category", competitionCategoryIds: ["category"] },
    { kind: "competition_category", competitionCategoryIds: null },
    { kind: "competition", competitionIds: ["competition"] },
  ];
  it.each(allowedScopes)(
    "allows a matching $kind read scope without requiring music-write permission",
    async (scope) => {
      resolveScope.mockResolvedValue({ editionId: "edition", scopes: [scope] });
      expect(await canReadKalakritiEntryMusic(input.user, record)).toBe(true);
      expect(resolveScope).toHaveBeenCalledWith({
        sessionUser: input.user,
        year: 2166,
      });
      expect(permissions).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    { scopes: [] },
    { scopes: [{ kind: "center", centerIds: ["other"] }] },
    {
      scopes: [
        { kind: "competition_category", competitionCategoryIds: ["other"] },
      ],
    },
    { scopes: [{ kind: "competition", competitionIds: ["other"] }] },
  ])("denies absent or unrelated registration scopes", async (resolved) => {
    resolveScope.mockResolvedValue(resolved);
    expect(await canReadKalakritiEntryMusic(input.user, record)).toBe(false);
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
