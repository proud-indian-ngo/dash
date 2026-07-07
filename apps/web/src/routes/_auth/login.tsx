import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { LoginForm } from "@/components/login/login-form";

export const Route = createFileRoute("/_auth/login")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: `Login | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch: z.object({
    redirect: z.string().optional(),
    status: z.enum(["email-verified", "password-reset"]).optional(),
  }),
});

function RouteComponent() {
  return (
    <AuthLayout panel={<LoginInfoPanel />}>
      <h1 className="sr-only">Login</h1>
      <LoginForm />
    </AuthLayout>
  );
}
