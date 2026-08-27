import { db } from "@pi-dash/db";
import { session, user } from "@pi-dash/db/schema/auth";
import { and, eq, ne, sql } from "drizzle-orm";
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

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") {
      return false;
    }
    if ("code" in current && current.code === "23505") {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function updateKalakritiExternalUserContact(
  tx: DbTransaction,
  {
    email,
    name,
    phone,
    userId,
  }: {
    email: string;
    name: string;
    phone: string | null;
    userId: string;
  }
) {
  const emailOwner = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(sql`lower(${user.email}) = ${email}`, ne(user.id, userId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (emailOwner) {
    throw new Error("An account with this email already exists");
  }
  if (phone) {
    const phoneOwner = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.phone, phone), ne(user.id, userId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (phoneOwner) {
      throw new Error("A user with this phone number already exists");
    }
  }

  try {
    const updated = await tx
      .update(user)
      .set({ email, name, phone })
      .where(and(eq(user.id, userId), eq(user.role, "external_user")))
      .returning({ id: user.id });
    if (updated.length !== 1) {
      throw new Error("Kalakriti external identity not found");
    }
  } catch (caughtError) {
    if (isUniqueViolation(caughtError)) {
      throw new Error("An account with this email or phone already exists", {
        cause: caughtError,
      });
    }
    throw caughtError;
  }
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
