import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import {
  getWhatsAppGroupJoinLink,
  type WhatsAppGroupJoinLink,
} from "@/functions/whatsapp-groups";

type JoinFailure = Extract<WhatsAppGroupJoinLink, { url: null }>;

/**
 * Where the "Join group" button in a WhatsApp group invite lands: Meta
 * doesn't allow chat.whatsapp.com links in template buttons, so this page
 * looks up the group's invite link and sends the person on to it, if they
 * are still entitled to the group.
 */
export const Route = createFileRoute("/_app/whatsapp-groups/$groupId/join")({
  beforeLoad: async ({ params }) => {
    const link = await getWhatsAppGroupJoinLink({
      data: { groupId: params.groupId },
    });
    if (link.url) {
      throw redirect({ href: link.url });
    }
    return {
      joinFailure: {
        backPath: link.backPath,
        name: link.name,
        reason: link.reason ?? "unavailable",
        url: null,
      } satisfies JoinFailure,
    };
  },
  component: JoinGroupPage,
  head: () => ({ meta: [{ title: `Join group | ${env.VITE_APP_NAME}` }] }),
});

function describeFailure({ name, reason }: JoinFailure): string {
  switch (reason) {
    case "not_member":
      return "You're not in the team or event this WhatsApp group belongs to, so its invite link isn't available to you. If you think you should be, ask your team lead to add you.";
    case "not_found":
      return "This WhatsApp group no longer exists. Ask your team lead which group to join.";
    default:
      return `The invite link for ${name ?? "this group"} isn't available right now. Try again in a few minutes, or ask your team lead to add you.`;
  }
}

const BACK_PATH = /^\/(teams|events)\/([^/]+)$/;

function BackLink({ backPath }: { backPath: string | null }) {
  const match = backPath ? BACK_PATH.exec(backPath) : null;
  if (!match) {
    return null;
  }
  const [, kind, id] = match;
  if (!id) {
    return null;
  }
  return (
    <Button
      nativeButton={false}
      render={
        kind === "teams" ? (
          <Link params={{ id }} to="/teams/$id" />
        ) : (
          <Link params={{ id }} to="/events/$id" />
        )
      }
      variant="outline"
    >
      {kind === "teams" ? "Back to team" : "Back to event"}
    </Button>
  );
}

function JoinGroupPage() {
  const { joinFailure } = Route.useRouteContext();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await router.invalidate();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            <BackLink backPath={joinFailure.backPath} />
            <Button disabled={retrying} onClick={retry} type="button">
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          </>
        }
        description={describeFailure(joinFailure)}
        title="Join WhatsApp group"
      />
    </div>
  );
}
