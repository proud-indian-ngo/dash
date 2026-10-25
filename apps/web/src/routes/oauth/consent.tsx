import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { StandalonePage } from "@/components/shared/not-found-state";
import { getConsentRequest } from "@/functions/oauth-consent";
import { getCachedAuth } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";

// What the assistant can do once connected, in the volunteer's words. The
// MCP tools that use the connection are listed in assistants.md.
const CAN_DO = [
  "See your name and email",
  "See your requests to join sessions",
  "Ask to join sessions for you, for a team lead to approve",
];

// Better Auth sends people here, signed in, while an assistant connects their
// account (assistants.md). Outside the app layout, like sign-in.
// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/oauth/consent")({
  // The signature covers the raw query, repeated keys included, which the
  // router's parsed search doesn't keep; read it from the browser.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { session } = await getCachedAuth();
    if (!session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }
    return { session };
  },
  loader: async () => {
    try {
      return {
        error: null,
        request: await getConsentRequest({
          data: { query: window.location.search.slice(1) },
        }),
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "This link can't be used. Start connecting again from the assistant.",
        request: null,
      };
    }
  },
  head: () => ({
    meta: [{ title: `Connect an assistant | ${env.VITE_APP_NAME}` }],
  }),
  component: ConsentPage,
});

function ConsentPage() {
  const { session } = Route.useRouteContext();
  const { error, request } = Route.useLoaderData();
  const [busy, setBusy] = useState(false);

  const answer = async (accept: boolean) => {
    setBusy(true);
    // The client plugin adds this page's signed query.
    const { data, error: consentError } = await authClient.$fetch<{
      url: string;
    }>("/oauth2/consent", { body: { accept }, method: "POST" });
    if (consentError || !data) {
      setBusy(false);
      toast.error(consentError?.message ?? "Couldn't connect the assistant");
      return;
    }
    window.location.href = data.url;
  };

  return (
    <StandalonePage>
      {/* Phones top-align it, as the sign-in pages do. */}
      <div className="flex w-full max-w-md flex-col gap-6 self-start pt-6 md:self-auto md:pt-0">
        {request ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-2xl font-semibold">
                {request.clientName} wants to use your Proud Indian account
              </h1>
              <p className="text-muted-foreground text-sm">
                Signed in as {session.user.email}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">It will be able to:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {CAN_DO.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-muted-foreground text-sm">
                It stays connected for up to 30 days, or until you disconnect it
                in the assistant.
              </p>
            </div>
            {request.redirectHost ? (
              <p className="text-muted-foreground text-sm">
                Allowing takes you back to {request.redirectHost}.
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                disabled={busy}
                onClick={() => answer(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => answer(true)}
                type="button"
              >
                Allow
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold">
              Connect an assistant
            </h1>
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}
      </div>
    </StandalonePage>
  );
}
