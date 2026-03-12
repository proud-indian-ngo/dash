import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => ({
    meta: [{ title: "Forgot Password | Proud Indian Dashboard" }],
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
