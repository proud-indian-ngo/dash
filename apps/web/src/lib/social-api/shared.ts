import type { SocialApiScope } from "@pi-dash/db/schema/social-api-token";
import { createRequestLogger } from "evlog";

import {
  authorizeSocialRequest,
  SOCIAL_NO_STORE,
  type SocialAuthResult,
  socialJsonError,
} from "@/lib/social-api-auth";

export type SocialAuthorize = (
  request: Request,
  scope: SocialApiScope | readonly SocialApiScope[],
  endpoint: string
) => Promise<SocialAuthResult>;

export const defaultSocialAuthorize: SocialAuthorize = (
  request,
  scope,
  endpoint
) => authorizeSocialRequest(request, scope, endpoint);

export function socialJson(body: unknown): Response {
  return Response.json(body, { headers: SOCIAL_NO_STORE });
}

export function socialNoContent(): Response {
  return new Response(null, { headers: SOCIAL_NO_STORE, status: 204 });
}

/** Log an unexpected failure and answer 500 (or `status`) without details. */
export function socialServerError(
  request: Request,
  error: unknown,
  fields: Record<string, string | number> = {},
  status = 500
): Response {
  const log = createRequestLogger({
    method: request.method,
    path: new URL(request.url).pathname,
  });
  log.set(fields);
  log.error(error instanceof Error ? error : String(error));
  log.emit();
  return socialJsonError(
    status,
    status === 502 ? "Upstream is unavailable right now" : "Internal error"
  );
}

/** Parse a JSON body; null when it is missing or malformed. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
