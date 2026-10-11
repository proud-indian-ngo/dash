import { createHash, randomBytes } from "node:crypto";

import {
  findActiveSocialApiToken,
  type SocialApiTokenRecord,
  touchSocialApiToken,
} from "@pi-dash/db/queries/social-api-token";
import type { SocialApiScope } from "@pi-dash/db/schema/social-api-token";
import { createRequestLogger } from "evlog";

import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Requests per minute per token and endpoint. */
export const SOCIAL_API_RATE_LIMIT_PER_MINUTE = 600;

export const SOCIAL_NO_STORE = { "Cache-Control": "no-store" } as const;

const BEARER_RE = /^Bearer\s+(\S+)\s*$/i;

export interface SocialAuthDeps {
  findToken: typeof findActiveSocialApiToken;
  now: () => Date;
  touchToken: typeof touchSocialApiToken;
}

const defaultAuthDeps: SocialAuthDeps = {
  findToken: findActiveSocialApiToken,
  now: () => new Date(),
  touchToken: touchSocialApiToken,
};

export type SocialAuthResult =
  | { error?: never; token: SocialApiTokenRecord }
  | { error: Response; token?: never };

/** New raw bearer token: 32 random bytes, base64url (same as `bun run social:token`). */
export function generateSocialToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSocialToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function socialJsonError(status: number, error: string): Response {
  return Response.json({ error }, { headers: SOCIAL_NO_STORE, status });
}

/**
 * Authenticate a social API request by its `Authorization: Bearer` token.
 * `scope` may list alternatives; any one grants access. 401 for a missing,
 * unknown or revoked token, 403 when the token lacks every listed scope.
 */
export async function requireSocialToken(
  request: Request,
  scope: SocialApiScope | readonly SocialApiScope[],
  deps: SocialAuthDeps = defaultAuthDeps
): Promise<SocialAuthResult> {
  const raw = request.headers.get("authorization")?.match(BEARER_RE)?.[1];
  if (!raw) {
    return { error: socialJsonError(401, "Unauthorized") };
  }
  // Lookup is by the sha256 of the presented token, so an attacker cannot
  // time a comparison against the stored value; no constant-time compare needed.
  const token = await deps.findToken(hashSocialToken(raw));
  if (!token) {
    return { error: socialJsonError(401, "Unauthorized") };
  }
  const accepted = typeof scope === "string" ? [scope] : scope;
  if (!accepted.some((s) => token.scopes.includes(s))) {
    return { error: socialJsonError(403, "Forbidden") };
  }
  deps.touchToken(token.id, deps.now()).catch((error: unknown) => {
    const log = createRequestLogger({ path: "social-api-auth" });
    log.set({ event: "token_touch_failed", tokenId: token.id });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
  });
  return { token };
}

export interface SocialRequestDeps {
  auth?: SocialAuthDeps;
  checkRateLimit: typeof checkRateLimit;
}

/** Token check plus the per-token, per-endpoint rate limit. */
export async function authorizeSocialRequest(
  request: Request,
  scope: SocialApiScope | readonly SocialApiScope[],
  endpoint: string,
  deps: SocialRequestDeps = { checkRateLimit }
): Promise<SocialAuthResult> {
  const result = await requireSocialToken(request, scope, deps.auth);
  if (result.error) {
    return result;
  }
  const limit = deps.checkRateLimit(
    `social-api:${endpoint}:${result.token.id}`,
    SOCIAL_API_RATE_LIMIT_PER_MINUTE
  );
  if (!limit.allowed) {
    const response = rateLimitResponse(limit);
    response.headers.set("Cache-Control", "no-store");
    return { error: response };
  }
  return result;
}

export function socialMethodNotAllowed(allow: string): Response {
  return Response.json(
    { error: "Method not allowed" },
    { headers: { ...SOCIAL_NO_STORE, Allow: allow }, status: 405 }
  );
}
