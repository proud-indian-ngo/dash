import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SignupInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { RegisterForm } from "@/components/login/register-form";

const uuidSchema = z.uuid();

function validateSearch(search: Record<string, unknown>): {
  eventId?: string;
  group?: string;
} {
  const result: { eventId?: string; group?: string } = {};
  if (typeof search.eventId === "string") {
    const parsed = uuidSchema.safeParse(search.eventId);
    if (parsed.success) {
      result.eventId = parsed.data;
    }
  }
  if (typeof search.group === "string") {
    const group = search.group.trim();
    if (group.length >= 1 && group.length <= 100) {
      result.group = group;
    }
  }
  return result;
}

export const Route = createFileRoute("/_auth/register")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: `Register | ${env.VITE_APP_NAME}` }],
  }),
  validateSearch,
});

function RouteComponent() {
  return (
    <AuthLayout panel={<SignupInfoPanel />}>
      <h1 className="sr-only">Register</h1>
      <RegisterForm />
    </AuthLayout>
  );
}
