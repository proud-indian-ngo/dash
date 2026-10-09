import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod";

import {
  EventInfoPanel,
  SignupInfoPanel,
} from "@/components/login/auth-info-panel";
import { AuthLayout } from "@/components/login/auth-layout";
import { RegisterEventBanner } from "@/components/login/register-event-banner";
import { RegisterForm } from "@/components/login/register-form";
import { loadPublicSessionSummary } from "@/lib/public-session-loader";

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
    await loadPublicSessionSummary(
      "/register",
      deps.interestEventId,
      deps.occDate
    ),
  head: () => ({
    meta: [{ title: `Register | ${env.VITE_APP_NAME}` }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const session = Route.useLoaderData();
  return (
    <AuthLayout
      panel={
        session ? (
          <EventInfoPanel mode="register" session={session} />
        ) : (
          <SignupInfoPanel />
        )
      }
    >
      <h1 className="sr-only">Register</h1>
      {/* The side panel is hidden below lg; the banner keeps the session in view. */}
      {session ? <RegisterEventBanner session={session} /> : null}
      <RegisterForm />
    </AuthLayout>
  );
}
