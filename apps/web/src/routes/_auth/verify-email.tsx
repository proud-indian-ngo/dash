import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";

import { AccountHelpPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { confirmEmailVerification } from "@/functions/verify-email";

export const Route = createFileRoute("/_auth/verify-email")({
  beforeLoad: ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/login" });
    }
    return { token: search.token };
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
  const { token } = Route.useRouteContext();
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    const result = await confirmEmailVerification({
      data: { redirect: search.redirect, token },
    });
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // A full load, so the app starts with the session verifying created.
    window.location.assign(result.href);
  };

  return (
    <AuthLayout
      panel={
        <AccountHelpPanel
          body="Open the link we emailed you to confirm your address and finish setting up your account."
          title="Confirm your email"
        />
      }
    >
      <div className="flex flex-col items-center gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Confirm your email
        </h1>
        {error ? (
          <p className="text-destructive text-center text-sm">{error}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-center text-sm">
              Confirm this address to finish setting up your account.
            </p>
            <Button
              className="w-full"
              disabled={busy}
              onClick={confirm}
              type="button"
            >
              Confirm email
            </Button>
          </>
        )}
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
