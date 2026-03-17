import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => ({
    meta: [{ title: `Forgot Password | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <h1 className="sr-only">Forgot Password</h1>
      <ForgotPasswordForm />
    </>
  );
}
