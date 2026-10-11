import { getSocialEvents } from "@pi-dash/db/queries/social-api";
import { env } from "@pi-dash/env/server";
import {
  parseSocialEventsWindow,
  SOCIAL_TIMEZONE,
  SocialApiQueryError,
  type SocialEventsResponse,
} from "@pi-dash/shared/social-api";

import { socialJsonError } from "@/lib/social-api-auth";

import {
  defaultSocialAuthorize,
  type SocialAuthorize,
  socialJson,
  socialServerError,
} from "./shared";

export interface SocialEventsDeps {
  authorize: SocialAuthorize;
  baseUrl: string;
  getSocialEvents: typeof getSocialEvents;
}

const defaultDeps: SocialEventsDeps = {
  authorize: defaultSocialAuthorize,
  baseUrl: env.BETTER_AUTH_URL,
  getSocialEvents,
};

/** `GET /api/social/v1/events?from=YYYY-MM-DD&to=YYYY-MM-DD` (scope events:read). */
export async function handleSocialEventsRequest(
  request: Request,
  deps: SocialEventsDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "events:read", "events");
  if (auth.error) {
    return auth.error;
  }
  let window: ReturnType<typeof parseSocialEventsWindow>;
  try {
    window = parseSocialEventsWindow(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof SocialApiQueryError) {
      return socialJsonError(400, error.message);
    }
    throw error;
  }
  try {
    const body: SocialEventsResponse = {
      events: await deps.getSocialEvents(window, deps.baseUrl),
      timezone: SOCIAL_TIMEZONE,
    };
    return socialJson(body);
  } catch (error) {
    return socialServerError(request, error, {
      from: window.from,
      to: window.to,
    });
  }
}
