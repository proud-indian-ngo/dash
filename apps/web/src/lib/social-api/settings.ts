import { getAppConfigValues } from "@pi-dash/db/queries/social-api";
import {
  buildSocialSettings,
  SOCIAL_PAUSED_CONFIG_KEY,
  SOCIAL_PAUSED_KINDS_CONFIG_KEY,
} from "@pi-dash/shared/social-api";

import {
  defaultSocialAuthorize,
  type SocialAuthorize,
  socialJson,
  socialServerError,
} from "./shared";

export interface SocialSettingsDeps {
  authorize: SocialAuthorize;
  getAppConfigValues: typeof getAppConfigValues;
}

const defaultDeps: SocialSettingsDeps = {
  authorize: defaultSocialAuthorize,
  getAppConfigValues,
};

/**
 * `GET /api/social/v1/settings` (scope events:read): the pause switches the
 * pipeline reads at the start of every run (Social page → Settings).
 */
export async function handleSocialSettingsRequest(
  request: Request,
  deps: SocialSettingsDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "events:read", "settings");
  if (auth.error) {
    return auth.error;
  }
  try {
    const config = await deps.getAppConfigValues([
      SOCIAL_PAUSED_CONFIG_KEY,
      SOCIAL_PAUSED_KINDS_CONFIG_KEY,
    ]);
    return socialJson(buildSocialSettings(config));
  } catch (error) {
    return socialServerError(request, error, { tokenId: auth.token.id });
  }
}
