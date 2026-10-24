import { env } from "@pi-dash/env/web";
import { isEventRegistrationInviteToken } from "@pi-dash/shared/event-registration-invite";
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
const inviteSchema = z.string().refine(isEventRegistrationInviteToken);
const occDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

interface RegisterSearch {
  eventInvite?: string;
  group?: string;
  /** Public-website sign-ups: file a pending interest request, not an enrollment. */
  interestEventId?: string;
  occDate?: string;
}

function validateSearch(search: Record<string, unknown>): RegisterSearch {
  const result: RegisterSearch = {};
  const eventInvite = inviteSchema.safeParse(search.eventInvite);
  if (eventInvite.success) {
    result.eventInvite = eventInvite.data;
  }
  const interestEventId = uuidSchema.safeParse(search.interestEventId);
  if (interestEventId.success) {
    result.interestEventId = interestEventId.data;
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
