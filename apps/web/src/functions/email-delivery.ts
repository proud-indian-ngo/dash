import { db } from "@pi-dash/db";
import {
  clearEmailSuppression,
  getEmailSuppression,
} from "@pi-dash/db/queries/email-suppression";
import { user } from "@pi-dash/db/schema/auth";
import type { EmailSuppressionReason } from "@pi-dash/db/schema/private/email-suppression";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { authMiddleware } from "@/middleware/auth";

const userIdSchema = z.object({ userId: z.string().min(1) });

async function findUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

export interface UserEmailSuppression {
  reason: EmailSuppressionReason;
  since: string;
}

/**
 * Whether email to this user is suppressed after a bounce or spam report.
 * POST so the response is never cached; suppressions are server-only.
 */
export const getUserEmailSuppression = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(userIdSchema)
  .handler(async ({ context, data }): Promise<UserEmailSuppression | null> => {
    await assertServerPermission(context.session, "users.manage");
    const email = await findUserEmail(data.userId);
    const suppression = email ? await getEmailSuppression(email) : null;
    return suppression
      ? {
          reason: suppression.reason,
          since: suppression.createdAt.toISOString(),
        }
      : null;
  });

/** Clears a user's suppression so email resumes, e.g. after they fixed their mailbox. */
export const resumeUserEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(userIdSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "user.email.resume",
        metadata: { changedFields: ["emailSuppression"] },
        target: { id: data.userId, type: "user" },
      },
      async () => {
        await assertServerPermission(context.session, "users.edit");
        const email = await findUserEmail(data.userId);
        if (!email) {
          throw new Error("User not found");
        }
        await clearEmailSuppression(email);
        return data.userId;
      }
    );
  });
