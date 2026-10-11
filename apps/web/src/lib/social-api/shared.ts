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

/** Largest request body the social API accepts. */
export const SOCIAL_MAX_BODY_BYTES = 64 * 1024;

export type JsonBodyResult = { body: unknown } | { tooLarge: Response };

/**
 * Parse a JSON body of at most `SOCIAL_MAX_BODY_BYTES`; `body` is null when
 * it is missing or malformed. A larger body is refused with 413, by
 * Content-Length before reading and by its actual size otherwise.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const tooLarge = () => ({
    tooLarge: socialJsonError(413, "Request body is too large"),
  });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SOCIAL_MAX_BODY_BYTES) {
    return tooLarge();
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { body: null };
  }
  if (new TextEncoder().encode(text).byteLength > SOCIAL_MAX_BODY_BYTES) {
    return tooLarge();
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { body: null };
  }
}
