import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginForm } from "@/components/login/login-form";

export const Route = createFileRoute("/_auth/login")({
  head: () => ({
    meta: [{ title: `Login | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch: z.object({
    status: z.enum(["email-verified", "password-reset"]).optional(),
    redirect: z.string().optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <h1 className="sr-only">Login</h1>
      <LoginForm />
    </>
  );
}
