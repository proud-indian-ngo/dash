import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  getAppConfigValues: mock(),
  getSocialMonthlyStats: mock(),
}));

import type { SocialMonthlyStats } from "@pi-dash/shared/social-api";

import { handleSocialStatsRequest, type SocialStatsDeps } from "./stats";
import { stubAuthorize } from "./test-helpers";

const computed: SocialMonthlyStats = {
  allTime: { hours: 120, optimists: 400, reached: 900 },
  children: 310,
  hours: 28,
  month: "2026-10",
  newOptimists: 9,
  partners: [{ instagram: null, linkedin: "ethos", name: "Ethos" }],
  sessions: 14,
  volunteers: 61,
};

function createDeps(config = new Map<string, string>()) {
  const getSocialMonthlyStats = mock(async () => computed);
  const getAppConfigValues = mock(async () => config);
  const deps: SocialStatsDeps = {
    authorize: stubAuthorize(),
    getAppConfigValues,
    getSocialMonthlyStats,
  };
  return { deps, getAppConfigValues, getSocialMonthlyStats };
}

const request = (query: string) =>
  new Request(`https://dash.proudindian.ngo/api/social/v1/stats${query}`);

describe("handleSocialStatsRequest", () => {
  it("returns the month with all-time overrides applied", async () => {
    const { deps, getSocialMonthlyStats } = createDeps(
      new Map([
        ["social_all_time_optimists", "3600"],
        ["social_all_time_hours", "14000"],
        ["social_all_time_reached", "23000"],
      ])
    );

    const response = await handleSocialStatsRequest(
      request("?month=2026-10"),
      deps
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...computed,
      allTime: { hours: 14000, optimists: 3600, reached: 23000 },
    });
    expect(getSocialMonthlyStats).toHaveBeenCalledWith({
      from: Date.parse("2026-10-01T00:00:00+05:30"),
      month: "2026-10",
      to: Date.parse("2026-11-01T00:00:00+05:30") - 1,
    });
  });

  it("keeps computed all-time values without overrides", async () => {
    const { deps } = createDeps();
    const response = await handleSocialStatsRequest(
      request("?month=2026-10"),
      deps
    );
    await expect(response.json()).resolves.toEqual(computed);
  });

  it.each(["", "?month=2026-13", "?month=2026-1", "?month=october"])(
    "returns 400 for %s",
    async (query) => {
      const { deps, getSocialMonthlyStats } = createDeps();
      const response = await handleSocialStatsRequest(request(query), deps);
      expect(response.status).toBe(400);
      expect(getSocialMonthlyStats).not.toHaveBeenCalled();
    }
  );
});
