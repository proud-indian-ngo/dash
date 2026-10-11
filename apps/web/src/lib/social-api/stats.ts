import {
  getAppConfigValues,
  getSocialMonthlyStats,
} from "@pi-dash/db/queries/social-api";
import {
  applyAllTimeOverrides,
  parseSocialStatsMonth,
  SOCIAL_ALL_TIME_CONFIG_KEYS,
  SocialApiQueryError,
  type SocialMonthlyStats,
} from "@pi-dash/shared/social-api";

import { socialJsonError } from "@/lib/social-api-auth";

import {
  defaultSocialAuthorize,
  type SocialAuthorize,
  socialJson,
  socialServerError,
} from "./shared";

export interface SocialStatsDeps {
  authorize: SocialAuthorize;
  getAppConfigValues: typeof getAppConfigValues;
  getSocialMonthlyStats: typeof getSocialMonthlyStats;
}

const defaultDeps: SocialStatsDeps = {
  authorize: defaultSocialAuthorize,
  getAppConfigValues,
  getSocialMonthlyStats,
};

/** `GET /api/social/v1/stats?month=YYYY-MM` (scope events:read). */
export async function handleSocialStatsRequest(
  request: Request,
  deps: SocialStatsDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "events:read", "stats");
  if (auth.error) {
    return auth.error;
  }
  let month: ReturnType<typeof parseSocialStatsMonth>;
  try {
    month = parseSocialStatsMonth(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof SocialApiQueryError) {
      return socialJsonError(400, error.message);
    }
    throw error;
  }
  try {
    const [stats, config] = await Promise.all([
      deps.getSocialMonthlyStats(month),
      deps.getAppConfigValues(Object.values(SOCIAL_ALL_TIME_CONFIG_KEYS)),
    ]);
    const body: SocialMonthlyStats = {
      ...stats,
      allTime: applyAllTimeOverrides(stats.allTime, config),
    };
    return socialJson(body);
  } catch (error) {
    return socialServerError(request, error, { month: month.month });
  }
}
