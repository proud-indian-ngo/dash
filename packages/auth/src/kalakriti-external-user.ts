import { db } from "@pi-dash/db";
import { session, user } from "@pi-dash/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface CreateKalakritiExternalUserInput {
  email: string;
  name: string;
  password: string;
  phone: string | null;
}

export async function createKalakritiExternalUser({
  email,
  name,
  password,
  phone,
}: CreateKalakritiExternalUserInput): Promise<{ id: string }> {
  const created = await auth.api.createUser({
    body: {
      data: {
        emailVerified: true,
        isActive: true,
        phone,
      },
      email,
      name,
      password,
      role: "external_user",
    },
  });
  return { id: created.user.id };
}

export async function deleteKalakritiExternalUser(userId: string) {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.role, "external_user")))
    .limit(1)
    .then((rows) => rows[0]);
  if (!existing) {
    throw new Error("Kalakriti external identity not found");
  }
  const context = await auth.$context;
  await context.internalAdapter.deleteUserSessions(userId);
  await context.internalAdapter.deleteUser(userId);
}

export async function setKalakritiExternalUserBlocked(
  tx: DbTransaction,
  {
    blocked,
    userId,
  }: {
    blocked: boolean;
    userId: string;
  }
) {
  const updated = await tx
    .update(user)
    .set(
      blocked
        ? {
            banExpires: null,
            banned: true,
            banReason: "No active Kalakriti Edition membership",
          }
        : { banExpires: null, banned: false, banReason: null }
    )
    .where(and(eq(user.id, userId), eq(user.role, "external_user")))
    .returning({ id: user.id });
  if (updated.length !== 1) {
    throw new Error("Kalakriti external identity not found");
  }
  if (blocked) {
    await tx.delete(session).where(eq(session.userId, userId));
  }
}
