import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ForgotPasswordForm />;
}
