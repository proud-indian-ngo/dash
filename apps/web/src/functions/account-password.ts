import { auth } from "@pi-dash/auth";
import { hasPassword } from "@pi-dash/auth/assistant-sign-up";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

/** Whether the signed-in account has a password (an assistant's sign-up doesn't). */
export const getHasPassword = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    return { hasPassword: await hasPassword(context.session.user.id) };
  });

/** Sets the first password of a signed-in account that has none. */
export const setInitialPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ newPassword: z.string().min(8).max(128) }))
  .handler(async ({ context, data }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "account.password.set",
        metadata: { changedFields: ["password"] },
      },
      async () => {
        if (await hasPassword(session.user.id)) {
          throw new HttpError(409, "This account already has a password");
        }
        const authContext = await auth.$context;
        await authContext.internalAdapter.createAccount({
          accountId: session.user.id,
          password: await authContext.password.hash(data.newPassword),
          providerId: "credential",
          userId: session.user.id,
        });
      }
    );
  });
