import { db } from "@pi-dash/db";
import { account, user } from "@pi-dash/db/schema/auth";
import { sendVerificationEmail } from "@pi-dash/email";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq } from "drizzle-orm";

import { auth, skipBouncedAuthEmail, verifyEmailPageUrl } from "./auth";

/**
 * Accounts an assistant creates (the MCP `start_volunteer_signup` tool) have
 * no password until their owner verifies the email and sets one. Anyone can
 * type someone else's email or phone into a chat, so the welcome and the
 * WhatsApp orientation a form sign-up starts at once wait for that
 * verification here.
 */

/**
 * The verification email for an assistant's sign-up, with a link that files
 * the session interest once the person verifies.
 */
export async function sendAssistantSignUpVerification(
  email: string,
  redirect: string
): Promise<void> {
  if (await skipBouncedAuthEmail(email, "verification")) {
    return;
  }
  const { secret } = await auth.$context;
  const token = await createEmailVerificationToken(secret, email);
  await sendVerificationEmail(email, verifyEmailPageUrl(token, redirect));
}

export async function hasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential"))
    )
    .limit(1);
  return !!row;
}

/** What a form sign-up enqueues at sign-up, run on first verification. */
export async function welcomeVerifiedAssistantSignUp(
  userId: string
): Promise<void> {
  const [row] = await db
    .select({ email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) {
    return;
  }
  await enqueue("notify-user-welcome", {
    email: row.email,
    name: row.name,
    userId,
  });
  if (row.role === "unoriented_volunteer") {
    await enqueue("whatsapp-manage-orientation", {
      isOriented: false,
      userId,
    });
  }
}
