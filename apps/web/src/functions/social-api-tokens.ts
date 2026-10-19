import {
  createSocialApiToken,
  listSocialApiTokens,
  revokeSocialApiToken,
} from "@pi-dash/db/queries/social-api-token";
import { socialApiScopeValues } from "@pi-dash/db/schema/social-api-token";
import { SOCIAL_TOKEN_NAME_MAX_LENGTH } from "@pi-dash/shared/social-recap";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import { generateSocialToken, hashSocialToken } from "@/lib/social-api-auth";
import { authMiddleware } from "@/middleware/auth";

/**
 * Social API bearer tokens (`social_api_token`) for the settings UI. The table
 * stays out of the Zero schema, so reads and writes go through these server
 * functions; `bun run social:token` remains the CLI fallback.
 */
const TOKEN_PERMISSION = "settings.app_config";

export interface SocialApiTokenListItem {
  createdAt: number;
  id: string;
  lastUsedAt: number | null;
  name: string;
  revokedAt: number | null;
  scopes: string[];
}

export const getSocialApiTokens = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SocialApiTokenListItem[]> => {
    await assertServerPermission(context.session, TOKEN_PERMISSION);
    const rows = await listSocialApiTokens();
    return rows.map((row) => ({
      createdAt: row.createdAt.getTime(),
      id: row.id,
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
      name: row.name,
      revokedAt: row.revokedAt?.getTime() ?? null,
      scopes: row.scopes,
    }));
  });

const createSocialApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(SOCIAL_TOKEN_NAME_MAX_LENGTH),
  scopes: z
    .array(z.enum(socialApiScopeValues))
    .min(1)
    .transform((scopes) => [...new Set(scopes)]),
});

/** Create a token and return its raw value; only the sha256 is stored. */
export const createSocialApiTokenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createSocialApiTokenSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "socialApiToken.create",
        // Never the raw token, its hash or the free-text name.
        metadata: {
          changedFields: ["name", "scopes"],
          scopes: data.scopes,
        },
        target: { type: "socialApiToken" },
      },
      async () => {
        await assertServerPermission(session, TOKEN_PERMISSION);
        const token = generateSocialToken();
        const id = await createSocialApiToken({
          name: data.name,
          scopes: data.scopes,
          tokenHash: hashSocialToken(token),
        });
        return { id, token };
      },
      undefined,
      (result) => ({ id: result.id, type: "socialApiToken" })
    );
  });

export const revokeSocialApiTokenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "socialApiToken.revoke",
        metadata: { changedFields: ["revokedAt"] },
        target: { id: data.id, type: "socialApiToken" },
      },
      async () => {
        await assertServerPermission(session, TOKEN_PERMISSION);
        const revoked = await revokeSocialApiToken(data.id);
        if (!revoked) {
          throw new HttpError(404, "Token not found or already revoked");
        }
        return { revoked };
      }
    );
  });
