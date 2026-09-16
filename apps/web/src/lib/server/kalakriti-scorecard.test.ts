import { beforeEach, describe, expect, it, mock } from "bun:test";

const tables = {
  kalakritiAssignment: { findMany: mock() },
  kalakritiCompetition: { findFirst: mock() },
  kalakritiCompetitionCategory: { findFirst: mock() },
  kalakritiCompetitionDivision: { findFirst: mock() },
  kalakritiEdition: { findFirst: mock() },
  kalakritiEditionMembership: { findFirst: mock() },
  kalakritiResultScorecard: { findFirst: mock() },
  kalakritiResultsState: { findFirst: mock() },
};
const resolvePermissions = mock();
mock.module("@pi-dash/db", () => ({ db: { query: tables } }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));

import {
  authorizeKalakritiScorecardUpload,
  canReadKalakritiScorecard,
  loadKalakritiScorecardRecord,
} from "./kalakriti-scorecard";

const user = { id: "user", role: "volunteer" };
const scope = { editionId: "edition", divisionId: "division", user };
const record = {
  competitionCategoryId: "category",
  competitionId: "competition",
  divisionId: "division",
  editionId: "edition",
  filename: "judge.pdf",
  key: "app/kalakriti-scorecards/edition/division/judge.pdf",
};

beforeEach(() => {
  for (const table of Object.values(tables)) {
    if ("findFirst" in table) table.findFirst.mockReset();
    if ("findMany" in table) table.findMany.mockReset();
  }
  resolvePermissions.mockReset();
  resolvePermissions.mockResolvedValue(["kalakriti.view"]);
  tables.kalakritiEdition.findFirst.mockResolvedValue({ lifecycle: "live" });
  tables.kalakritiCompetitionDivision.findFirst.mockResolvedValue({
    competitionId: "competition",
    editionId: "edition",
  });
  tables.kalakritiCompetition.findFirst.mockResolvedValue({
    cancelledAt: null,
    competitionCategoryId: "category",
    editionId: "edition",
    retiredAt: null,
  });
  tables.kalakritiCompetitionCategory.findFirst.mockResolvedValue({
    editionId: "edition",
    retiredAt: null,
  });
  tables.kalakritiResultsState.findFirst.mockResolvedValue({
    finalizedAt: null,
  });
  tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
    id: "membership",
    kind: "volunteer",
  });
  tables.kalakritiAssignment.findMany.mockResolvedValue([
    {
      competitionCategoryId: null,
      competitionId: "competition",
      responsibility: "competition_coordinator",
    },
  ]);
  tables.kalakritiResultScorecard.findFirst.mockResolvedValue({
    divisionId: "division",
    editionId: "edition",
    fileName: "judge.pdf",
    objectKey: record.key,
  });
});

describe("Kalakriti scorecard authorization", () => {
  it("permits a scoped active competition coordinator", async () => {
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).resolves.toBeUndefined();
    expect(await canReadKalakritiScorecard(user, record)).toBe(true);
  });

  it("denies another competition and a Guardian", async () => {
    tables.kalakritiAssignment.findMany.mockResolvedValue([
      { competitionId: "other", responsibility: "competition_coordinator" },
    ]);
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).rejects.toMatchObject({ status: 403 });
    expect(await canReadKalakritiScorecard(user, record)).toBe(false);
    tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
      id: "guardian",
      kind: "guardian",
    });
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects nonlive, finalized, and cross-Edition upload scopes", async () => {
    tables.kalakritiEdition.findFirst.mockResolvedValue({
      lifecycle: "archived",
    });
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).rejects.toMatchObject({ status: 403 });
    tables.kalakritiEdition.findFirst.mockResolvedValue({ lifecycle: "live" });
    tables.kalakritiResultsState.findFirst.mockResolvedValue({
      finalizedAt: new Date(),
    });
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).rejects.toMatchObject({ status: 403 });
    tables.kalakritiResultsState.findFirst.mockResolvedValue(null);
    tables.kalakritiCompetitionDivision.findFirst.mockResolvedValue({
      competitionId: "competition",
      editionId: "other",
    });
    await expect(
      authorizeKalakritiScorecardUpload(scope)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("resolves an exact persisted scorecard and protects archived downloads", async () => {
    expect(await loadKalakritiScorecardRecord("scorecard")).toEqual(record);
    tables.kalakritiEdition.findFirst.mockResolvedValue({
      lifecycle: "archived",
    });
    expect(await canReadKalakritiScorecard(user, record)).toBe(false);
    resolvePermissions.mockResolvedValue(["kalakriti.admin"]);
    expect(await canReadKalakritiScorecard(user, record)).toBe(true);
  });
});
