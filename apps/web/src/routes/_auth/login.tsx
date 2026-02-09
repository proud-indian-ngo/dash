import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LoginForm } from "@/components/login/login-form";

export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({
    status: z.enum(["email-verified", "password-reset"]).optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <LoginForm />;
}
