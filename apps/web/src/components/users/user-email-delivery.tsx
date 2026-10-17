import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import {
  getUserEmailSuppression,
  resumeUserEmail,
  type UserEmailSuppression,
} from "@/functions/email-delivery";
import { DATE } from "@/lib/date-formats";
import { getErrorMessage } from "@/lib/errors";

const COPY = {
  complaint: {
    badge: "Reported as spam",
    detail:
      "They marked an email as spam, so notification emails are paused. Sign-in and password emails still go out.",
  },
  hard_bounce: {
    badge: "Email bouncing",
    detail:
      "Their mail server rejected an email, so notification, sign-in and password emails are paused. Resume once the address works again.",
  },
} as const;

/**
 * Shown on the user sheet only when Resend reported a bounce or spam
 * complaint for the user's address. Suppressions are server-only, so this
 * reads them through a server function whenever the sheet opens a user.
 */
export function UserEmailDelivery({ userId }: { userId: string }) {
  const { hasPermission } = useApp();
  const loadSuppression = useServerFn(getUserEmailSuppression);
  const resume = useServerFn(resumeUserEmail);
  const [suppression, setSuppression] = useState<UserEmailSuppression | null>(
    null
  );
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSuppression(null);
    loadSuppression({ data: { userId } })
      .then((result) => {
        if (!cancelled) {
          setSuppression(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "user.loadEmailSuppression",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "UserEmailDelivery",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadSuppression]);

  const handleResume = useEventCallback(async () => {
    setResuming(true);
    try {
      await resume({ data: { userId } });
      setSuppression(null);
      toast.success("Email resumed");
    } catch (error) {
      log.error({
        action: "user.resumeEmail",
        caughtError: error instanceof Error ? error.message : String(error),
        component: "UserEmailDelivery",
      });
      toast.error(getErrorMessage(error));
    }
    setResuming(false);
  });

  if (!suppression) {
    return null;
  }
  const copy = COPY[suppression.reason];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Email delivery</h3>
        {hasPermission("users.edit") ? (
          <Button
            disabled={resuming}
            onClick={handleResume}
            size="sm"
            variant="outline"
          >
            Resume email
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <StatusBadge tone="warning">{copy.badge}</StatusBadge>
        <p className="text-muted-foreground text-sm">
          Since {format(new Date(suppression.since), DATE)}. {copy.detail}
        </p>
      </div>
    </div>
  );
}
