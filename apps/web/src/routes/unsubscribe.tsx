import {
  LinkBackwardIcon,
  MailRemove01Icon,
  MailValidation01Icon,
  Unlink04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";

import {
  NotFoundState,
  StandalonePage,
} from "@/components/shared/not-found-state";
import {
  getUnsubscribeLinkState,
  unsubscribeSearchSchema,
} from "@/functions/email-unsubscribe";

// Search, then deps, then loader: TanStack infers each from the one before.
export const Route = createFileRoute("/unsubscribe")({
  validateSearch: unsubscribeSearchSchema,
  loaderDeps: ({ search }) => ({ sig: search.sig, t: search.t, u: search.u }),
  loader: ({ deps }) => getUnsubscribeLinkState({ data: deps }),
  component: UnsubscribePage,
  head: () => ({ meta: [{ title: "Email preferences" }] }),
});

type PendingState = "idle" | "saving" | "error";

function SettingsButton() {
  return (
    <Button
      nativeButton={false}
      render={<Link to="/settings/notifications" />}
      variant="outline"
    >
      Notification settings
    </Button>
  );
}

function UnsubscribePage() {
  const link = Route.useLoaderData();
  const search = Route.useSearch();
  const [emailEnabled, setEmailEnabled] = useState(
    link.status === "valid" ? link.emailEnabled : false
  );
  const [pending, setPending] = useState<PendingState>("idle");

  if (link.status === "invalid") {
    return (
      <StandalonePage>
        <NotFoundState
          actions={<SettingsButton />}
          description="It may be incomplete or out of date. You can change which emails you get in your notification settings."
          icon={Unlink04Icon}
          title="This link doesn't work"
        />
      </StandalonePage>
    );
  }

  const update = async (enable: boolean) => {
    setPending("saving");
    const params = new URLSearchParams(search);
    if (enable) {
      params.set("resubscribe", "1");
    }
    try {
      const response = await fetch(`/api/email/unsubscribe?${params}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setEmailEnabled(enable);
      setPending("idle");
    } catch (error) {
      log.error({
        action: "email.unsubscribe",
        caughtError: error instanceof Error ? error.message : String(error),
        component: "UnsubscribePage",
      });
      setPending("error");
    }
  };

  const errorLine =
    pending === "error" ? (
      <p className="text-destructive">
        That didn't work. Try again, or use your notification settings.
      </p>
    ) : null;

  if (emailEnabled) {
    return (
      <StandalonePage>
        <NotFoundState
          actions={
            <>
              <SettingsButton />
              <Button
                disabled={pending === "saving"}
                onClick={() => update(false)}
              >
                Unsubscribe
              </Button>
            </>
          }
          description={
            <>
              You'll stop getting <strong>{link.topicLabel}</strong> emails.
              Inbox and WhatsApp notifications don't change.
            </>
          }
          footer={errorLine}
          icon={MailRemove01Icon}
          title="Unsubscribe from these emails?"
        />
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <NotFoundState
        actions={
          <>
            <Button
              disabled={pending === "saving"}
              onClick={() => update(true)}
              variant="outline"
            >
              <HugeiconsIcon
                data-icon="inline-start"
                icon={LinkBackwardIcon}
                strokeWidth={2}
              />
              Undo
            </Button>
            <SettingsButton />
          </>
        }
        description={
          <>
            You won't get <strong>{link.topicLabel}</strong> emails any more.
            Turn them back on any time in your notification settings.
          </>
        }
        footer={errorLine}
        icon={MailValidation01Icon}
        title="You're unsubscribed"
      />
    </StandalonePage>
  );
}
