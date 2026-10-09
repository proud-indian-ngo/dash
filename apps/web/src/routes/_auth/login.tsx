import { env } from "@pi-dash/env/web";
import { parseEventRedirect } from "@pi-dash/shared/event-redirect";
import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod";

import {
  EventInfoPanel,
  LoginInfoPanel,
} from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { LoginForm } from "@/components/login/login-form";
import { loadPublicSessionSummary } from "@/lib/public-session-loader";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    status: z.enum(["email-verified", "password-reset"]).optional(),
  }),
  loaderDeps: ({ search }) => {
    const eventRedirect = parseEventRedirect(search.redirect);
    return {
      eventId: eventRedirect?.eventId,
      occDate: eventRedirect?.occDate,
    };
  },
  // Website event links keep showing which session the visitor is joining.
  loader: async ({ deps }) =>
    await loadPublicSessionSummary("/login", deps.eventId, deps.occDate),
  head: () => ({
    meta: [{ title: `Login | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const session = Route.useLoaderData();
  return (
    <AuthLayout
      panel={
        session ? (
          <EventInfoPanel mode="login" session={session} />
        ) : (
          <LoginInfoPanel />
        )
      }
    >
      <h1 className="sr-only">Login</h1>
      <LoginForm />
    </AuthLayout>
  );
}
