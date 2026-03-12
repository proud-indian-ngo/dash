import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/components/login/reset-password-form";

export const Route = createFileRoute("/_auth/reset-password")({
  head: () => ({
    meta: [{ title: "Reset Password | Proud Indian Dashboard" }],
  }),
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  beforeLoad: ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/forgot-password" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <h1 className="sr-only">Reset Password</h1>
      <ResetPasswordForm />
    </>
  );
}
