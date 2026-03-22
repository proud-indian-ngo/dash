import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { SignupInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { RegisterForm } from "@/components/login/register-form";

export const Route = createFileRoute("/_auth/register")({
  head: () => ({
    meta: [{ title: `Register | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthLayout panel={<SignupInfoPanel />}>
      <h1 className="sr-only">Register</h1>
      <RegisterForm />
    </AuthLayout>
  );
}
