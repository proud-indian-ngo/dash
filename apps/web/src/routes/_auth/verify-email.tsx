import { auth } from "@pi-dash/auth";
import { env } from "@pi-dash/env/web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LoginInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";

const verifyEmailToken = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const result = await auth.api.verifyEmail({
        query: { token: data.token },
      });

      if (!result) {
        return { error: "Verification failed. The link may have expired." };
      }

      return { error: null };
    } catch (e) {
      const message =
        e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (
        message.includes("already verified") ||
        message.includes("already been verified")
      ) {
        return { error: null, alreadyVerified: true };
      }
      return { error: "Verification failed. The link may have expired." };
    }
  });

export const Route = createFileRoute("/_auth/verify-email")({
  head: () => ({
    meta: [{ title: `Verify Email | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/login" });
    }

    const result = await verifyEmailToken({ data: { token: search.token } });

    if (!result.error) {
      throw redirect({
        to: "/login",
        search: { status: "email-verified" },
      });
    }

    return { verificationError: result.error };
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { verificationError } = Route.useRouteContext();

  return (
    <AuthLayout panel={<LoginInfoPanel />}>
      <div className="flex flex-col items-center gap-4">
        <h1 className="sr-only">Verify Email</h1>
        <p className="text-center text-destructive text-sm">
          {verificationError}
        </p>
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          to="/login"
        >
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}
