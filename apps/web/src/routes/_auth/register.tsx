import { createFileRoute } from "@tanstack/react-router";

import { RegisterForm } from "@/components/login/register-form";

export const Route = createFileRoute("/_auth/register")({
  head: () => ({
    meta: [{ title: "Register | Proud Indian Dashboard" }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <h1 className="sr-only">Register</h1>
      <RegisterForm />
    </>
  );
}
