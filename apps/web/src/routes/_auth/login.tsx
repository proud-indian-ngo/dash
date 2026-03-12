import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginForm } from "@/components/login/login-form";

export const Route = createFileRoute("/_auth/login")({
  head: () => ({
    meta: [{ title: "Login | Proud Indian Dashboard" }],
  }),
  validateSearch: z.object({
    status: z.enum(["email-verified", "password-reset"]).optional(),
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
