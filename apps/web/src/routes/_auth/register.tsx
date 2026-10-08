import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import * as z from "zod";

import { SignupInfoPanel } from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { RegisterEventBanner } from "@/components/login/register-event-banner";
import { RegisterForm } from "@/components/login/register-form";
import { getPublicSessionSummary } from "@/functions/public-session-summary";

const uuidSchema = z.uuid();
const occDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

interface RegisterSearch {
  eventId?: string;
  group?: string;
  /** Public-website sign-ups: file a pending interest request, not an enrollment. */
  interestEventId?: string;
  occDate?: string;
}

function validateSearch(search: Record<string, unknown>): RegisterSearch {
  const result: RegisterSearch = {};
  for (const key of ["eventId", "interestEventId"] as const) {
    const parsed = uuidSchema.safeParse(search[key]);
    if (parsed.success) {
      result[key] = parsed.data;
    }
  }
  const occDate = occDateSchema.safeParse(search.occDate);
  if (occDate.success) {
    result.occDate = occDate.data;
  }
  if (typeof search.group === "string") {
    const group = search.group.trim();
    if (group.length >= 1 && group.length <= 100) {
      result.group = group;
    }
  }
  return result;
}

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_auth/register")({
  validateSearch,
  loaderDeps: ({ search }) => ({
    interestEventId: search.interestEventId,
    occDate: search.occDate,
  }),
  // Website sign-up links show which session the visitor is joining.
  loader: async ({ deps }) =>
    deps.interestEventId
      ? await getPublicSessionSummary({
          data: { eventId: deps.interestEventId, occDate: deps.occDate },
        }).catch((error: unknown) => {
          // The banner is optional; the sign-up form still works without it.
          log.error({
            action: "getPublicSessionSummary",
            error: error instanceof Error ? error.message : String(error),
            eventId: deps.interestEventId,
            route: "/register",
          });
          return null;
        })
      : null,
  head: () => ({
    meta: [{ title: `Register | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const session = Route.useLoaderData();
  return (
    <AuthLayout panel={<SignupInfoPanel />}>
      <h1 className="sr-only">Register</h1>
      {session ? <RegisterEventBanner session={session} /> : null}
      <RegisterForm />
    </AuthLayout>
  );
}
