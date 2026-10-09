import { auth } from "@pi-dash/auth";
import {
  fileVerifiedSignUpInterest,
  findUnverifiedUserForToken,
} from "@pi-dash/auth/register-interest-db";
import { env } from "@pi-dash/env/web";
import {
  eventPagePath,
  parseEventRedirect,
} from "@pi-dash/shared/event-redirect";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import * as z from "zod";

import { LoginInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";

const verifyEmailToken = createServerFn({ method: "GET" })
  .validator(
    z.object({
      /** Website sign-up: file a pending interest on first verification. */
      interest: z
        .object({
          eventId: z.uuid(),
          occDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .optional(),
      token: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    try {
      // Read before verifying: only a first verification files the interest.
      const unverifiedUser = data.interest
        ? await findUnverifiedUserForToken(data.token)
        : null;
      const result = await auth.api.verifyEmail({
        query: { token: data.token },
      });

      if (!result) {
        return { error: "Verification failed. The link may have expired." };
      }

      if (unverifiedUser && data.interest) {
        await fileVerifiedSignUpInterest(unverifiedUser, data.interest);
      }

      return { error: null };
    } catch (e) {
      const message =
        e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (
        message.includes("already verified") ||
        message.includes("already been verified")
      ) {
        return { alreadyVerified: true, error: null };
      }
      const log = createRequestLogger();
      log.set({ handler: "verifyEmailToken", token: data.token });
      log.error(e instanceof Error ? e : String(e));
      log.emit();
      return { error: "Verification failed. The link may have expired." };
    }
  });

export const Route = createFileRoute("/_auth/verify-email")({
  beforeLoad: async ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/login" });
    }

    const eventRedirect = parseEventRedirect(search.redirect);
    const result = await verifyEmailToken({
      data: {
        interest: eventRedirect?.interest
          ? { eventId: eventRedirect.eventId, occDate: eventRedirect.occDate }
          : undefined,
        token: search.token,
      },
    });

    if (!result.error) {
      throw redirect({
        search: {
          redirect: eventRedirect ? eventPagePath(eventRedirect) : undefined,
          status: "email-verified",
        },
        to: "/login",
      });
    }

    return { verificationError: result.error };
  },
  component: VerifyEmailPage,
  head: () => ({
    meta: [{ title: `Verify Email | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch: z.object({
    redirect: z.string().optional(),
    token: z.string().optional(),
  }),
});

function VerifyEmailPage() {
  const { verificationError } = Route.useRouteContext();

  return (
    <AuthLayout panel={<LoginInfoPanel />}>
      <div className="flex flex-col items-center gap-4">
        <h1 className="sr-only">Verify Email</h1>
        <p className="text-destructive text-center text-sm">
          {verificationError}
        </p>
        <Link
          className="text-muted-foreground hover:text-foreground text-sm"
          to="/login"
        >
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}
