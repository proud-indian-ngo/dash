import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { LoginInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => ({
    meta: [{ title: `Forgot Password | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthLayout panel={<LoginInfoPanel />}>
      <h1 className="sr-only">Forgot Password</h1>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
