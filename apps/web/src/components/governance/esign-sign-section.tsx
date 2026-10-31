import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { useVoteReauth } from "./use-vote-reauth";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Aadhaar eSign on any document: the signer signs on Leegality in a new
 * tab, then comes back to have the signature recorded (the scheduled check
 * takes it too). `link` fetches their signing link after a recent sign-in;
 * `collect` takes what they signed. Once the invitation has lapsed,
 * `lapsed` says what to do instead.
 */
export function EsignSignSection({
  action,
  collect,
  lapsed,
  link,
}: {
  /** The audit action, for the error log. */
  action: string;
  collect: () => Promise<{ message: string }>;
  lapsed?: string;
  link: () => Promise<{ url: string }>;
}) {
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSign = useEventCallback(async () => {
    setOpening(true);
    // Opened now, while the click still counts, so it isn't blocked; it
    // says what's happening if the dashboard asks for the password first.
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = "Opening Leegality";
      tab.document.body.textContent =
        "Opening Leegality… If the dashboard asks for your password, confirm it there.";
    }
    await runVote(link)
      .then((result) => {
        if (!result) {
          tab?.close();
          return;
        }
        if (tab) {
          tab.opener = null;
          tab.location.href = result.url;
        } else {
          window.location.href = result.url;
        }
      })
      .catch((error: unknown) => {
        tab?.close();
        log.error({
          action: `${action}.start`,
          caughtError: errorText(error, "unknown"),
          component: "EsignSignSection",
        });
        toast.error("Couldn't open Leegality", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setOpening(false));
  });

  const handleCheck = useEventCallback(async () => {
    setChecking(true);
    await collect()
      .then(({ message }) => toast.success(message))
      .catch((error: unknown) => {
        log.error({
          action,
          caughtError: errorText(error, "unknown"),
          component: "EsignSignSection",
        });
        toast.error("Your signature wasn't recorded", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setChecking(false));
  });

  if (lapsed) {
    return <p className="text-muted-foreground text-sm">{lapsed}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>Open Leegality and sign in your box with Aadhaar eSign.</li>
        <li>Come back here and record your signature.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button disabled={opening} onClick={handleSign} type="button">
          <HugeiconsIcon
            className="size-4"
            icon={LinkSquare02Icon}
            strokeWidth={2}
          />
          {opening ? "Opening Leegality..." : "Sign with Aadhaar eSign"}
        </Button>
        <Button
          disabled={checking}
          onClick={handleCheck}
          type="button"
          variant="outline"
        >
          {checking ? "Checking..." : "I've signed"}
        </Button>
      </div>
      {reauthDialog}
    </div>
  );
}
