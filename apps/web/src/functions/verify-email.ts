import { auth } from "@pi-dash/auth";
import {
  hasPassword,
  welcomeVerifiedAssistantSignUp,
} from "@pi-dash/auth/assistant-sign-up";
import {
  fileVerifiedSignUpInterest,
  findUnverifiedUserForToken,
} from "@pi-dash/auth/register-interest-db";
import { withFireAndForgetLog } from "@pi-dash/observability";
import {
  eventPagePath,
  parseEventRedirect,
} from "@pi-dash/shared/event-redirect";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import * as z from "zod";

const FAILED = "Verification failed. The link may have expired.";

/**
 * Verifies the address behind a verification link, on the page's button
 * rather than on load: verifying signs the account in, and mail scanners
 * open links. Returns where to go next, signed in, or why it failed.
 */
export const confirmEmailVerification = createServerFn({ method: "POST" })
  .validator(
    z.object({
      redirect: z.string().optional(),
      token: z.string().min(1),
    })
  )
  .handler(async ({ data }): Promise<{ error: string } | { href: string }> => {
    const eventRedirect = parseEventRedirect(data.redirect);
    const landing = eventRedirect ? eventPagePath(eventRedirect) : "/";
    try {
      // Read before verifying: only a first verification acts on the account.
      const unverifiedUser = await findUnverifiedUserForToken(data.token);
      const result = await auth.api.verifyEmail({
        query: { token: data.token },
      });
      if (!result) {
        return { error: FAILED };
      }
      if (!unverifiedUser) {
        return { href: landing };
      }
      // A website sign-up files a pending interest on first verification.
      if (eventRedirect?.interest) {
        await fileVerifiedSignUpInterest(unverifiedUser, {
          eventId: eventRedirect.eventId,
          occDate: eventRedirect.occDate,
        });
      }
      // Only an assistant's sign-up has no password (assistants.md).
      if (await hasPassword(unverifiedUser.id)) {
        return { href: landing };
      }
      withFireAndForgetLog(
        { action: "welcomeAssistantSignUp", userId: unverifiedUser.id },
        () => welcomeVerifiedAssistantSignUp(unverifiedUser.id)
      );
      return {
        href: `/set-password?${new URLSearchParams({ redirect: landing })}`,
      };
    } catch (e) {
      const message =
        e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (
        message.includes("already verified") ||
        message.includes("already been verified")
      ) {
        return {
          href: `/login?${new URLSearchParams({
            ...(eventRedirect && { redirect: landing }),
            status: "email-verified",
          })}`,
        };
      }
      const log = createRequestLogger();
      log.set({ handler: "confirmEmailVerification", token: data.token });
      log.error(e instanceof Error ? e : String(e));
      log.emit();
      return { error: FAILED };
    }
  });
