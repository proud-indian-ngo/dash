import { and, desc, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  type SocialApiScope,
  socialApiToken,
} from "../schema/social-api-token";

export interface SocialApiTokenRecord {
  id: string;
  name: string;
  scopes: SocialApiScope[];
}

/** Active (not revoked) token for a sha256 hex hash, or null. */
export async function findActiveSocialApiToken(
  tokenHash: string
): Promise<SocialApiTokenRecord | null> {
  const [row] = await db
    .select({
      id: socialApiToken.id,
      name: socialApiToken.name,
      scopes: socialApiToken.scopes,
    })
    .from(socialApiToken)
    .where(
      and(
        eq(socialApiToken.tokenHash, tokenHash),
        isNull(socialApiToken.revokedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function touchSocialApiToken(
  id: string,
  now: Date
): Promise<void> {
  await db
    .update(socialApiToken)
    .set({ lastUsedAt: now })
    .where(eq(socialApiToken.id, id));
}

export async function createSocialApiToken(input: {
  name: string;
  scopes: SocialApiScope[];
  tokenHash: string;
}): Promise<string> {
  const id = uuidv7();
  await db
    .insert(socialApiToken)
    .values({ ...input, createdAt: new Date(), id });
  return id;
}

export async function listSocialApiTokens() {
  return await db
    .select({
      createdAt: socialApiToken.createdAt,
      id: socialApiToken.id,
      lastUsedAt: socialApiToken.lastUsedAt,
      name: socialApiToken.name,
      revokedAt: socialApiToken.revokedAt,
      scopes: socialApiToken.scopes,
    })
    .from(socialApiToken)
    .orderBy(desc(socialApiToken.createdAt));
}

/** Revoke a token; false when it does not exist or is already revoked. */
export async function revokeSocialApiToken(id: string): Promise<boolean> {
  const rows = await db
    .update(socialApiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(socialApiToken.id, id), isNull(socialApiToken.revokedAt)))
    .returning({ id: socialApiToken.id });
  return rows.length === 1;
}
