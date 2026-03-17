import { env } from "@pi-dash/env/web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/components/login/reset-password-form";

export const Route = createFileRoute("/_auth/reset-password")({
  head: () => ({
    meta: [{ title: `Reset Password | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  beforeLoad: ({ search }) => {
    if (!(search.token || search.error)) {
      throw redirect({ to: "/forgot-password" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { token, error } = Route.useSearch();

  if (error || !token) {
    return (
      <div className="flex flex-col items-center gap-4">
        <h1 className="sr-only">Reset Password</h1>
        <p className="text-center text-destructive text-sm">
          {error || "Invalid or expired reset link."}
        </p>
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          to="/forgot-password"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Reset Password</h1>
      <ResetPasswordForm />
    </>
  );
}
