import { getAppConfigValues } from "@pi-dash/db/queries/social-api";
import {
  buildSocialSettings,
  SOCIAL_PAUSED_CONFIG_KEY,
  SOCIAL_PAUSED_KINDS_CONFIG_KEY,
  SOCIAL_RULES_CONFIG_KEY,
} from "@pi-dash/shared/social-api";
import { createRequestLogger } from "evlog";

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
 * `GET /api/social/v1/settings` (scope events:read): the pause switches and
 * posting rules the pipeline reads at the start of every run (Social page →
 * Settings). An invalid stored `social_rules` is logged and served as `{}`.
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
      SOCIAL_RULES_CONFIG_KEY,
    ]);
    return socialJson(
      buildSocialSettings(config, (reason) => {
        const log = createRequestLogger({
          method: request.method,
          path: new URL(request.url).pathname,
        });
        log.set({ event: "social_rules_invalid", tokenId: auth.token.id });
        log.warn(reason);
        log.emit();
      })
    );
  } catch (error) {
    return socialServerError(request, error, { tokenId: auth.token.id });
  }
}
