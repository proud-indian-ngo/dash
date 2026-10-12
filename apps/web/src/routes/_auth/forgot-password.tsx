import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { AccountHelpPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: `Forgot password | ${env.VITE_APP_NAME}` }],
  }),
});

function RouteComponent() {
  return (
    <AuthLayout
      panel={
        <AccountHelpPanel
          body="We'll email you a link to choose a new password. It works for one hour, and your account stays as it is until you use it."
          title="Locked out?"
        />
      }
    >
      <h1 className="sr-only">Forgot password</h1>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
