import { FingerPrintIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  checkEsignFn,
  getEsignStatusFn,
  startEsignFn,
} from "@/functions/signing";

type EsignStatus = Awaited<ReturnType<typeof getEsignStatusFn>>;

const POLL_MS = 5000;

function errorText(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

/**
 * Sign with Aadhaar eSign through Leegality: the signing journey opens in a
 * new tab, and the signature appears here once Leegality reports it (or
 * when the trustee asks to check). Hidden until Leegality is set up.
 */
export function EsignSection({
  onVote,
  resolutionId,
}: {
  /** Runs an action through the recent-sign-in check. */
  onVote: <T>(action: () => Promise<T>) => Promise<T | null>;
  resolutionId: string;
}) {
  const loadStatus = useServerFn(getEsignStatusFn);
  const start = useServerFn(startEsignFn);
  const check = useServerFn(checkEsignFn);
  const [status, setStatus] = useState<EsignStatus | null>(null);
  const [busy, setBusy] = useState<"start" | "check" | null>(null);

  const refresh = useEventCallback(() => {
    loadStatus({ data: { resolutionId } })
      .then(setStatus)
      .catch((error: unknown) => {
        log.error({
          action: "esign.status",
          caughtError: errorText(error) ?? String(error),
          component: "EsignSection",
        });
      });
  });
  useEffect(() => {
    refresh();
  }, [refresh]);

  const waiting = status?.latest?.status === "pending";
  // While Leegality has the circular, the webhook settles it; look again now and then.
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  const handleStart = useEventCallback(async () => {
    // Opened now, while the click still counts, so the browser allows it.
    const tab = window.open("", "_blank");
    setBusy("start");
    try {
      const started = await onVote(() => start({ data: { resolutionId } }));
      if (!started) {
        tab?.close();
        return;
      }
      if (tab) {
        tab.location.href = started.signUrl;
      } else {
        window.location.href = started.signUrl;
      }
      refresh();
    } catch (error) {
      tab?.close();
      toast.error("Couldn't start Aadhaar eSign", {
        description: errorText(error),
      });
    } finally {
      setBusy(null);
    }
  });

  const handleCheck = useEventCallback(async () => {
    setBusy("check");
    try {
      const outcome = await check({ data: { resolutionId } });
      if (outcome.status === "signed") {
        toast.success("Signed with Aadhaar eSign");
      } else if (outcome.status === "pending") {
        toast.info("Leegality doesn't have your signature yet.");
      } else {
        toast.error("Your eSign didn't go through", {
          description: outcome.message,
        });
      }
      refresh();
    } catch (error) {
      toast.error("Couldn't check with Leegality", {
        description: errorText(error),
      });
    } finally {
      setBusy(null);
    }
  });

  if (!status?.available) {
    return null;
  }
  const failed =
    status.latest?.status === "failed" ? status.latest.error : null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Or sign with Aadhaar eSign</h3>
      <p className="text-sm">
        No token needed: Leegality opens in a new tab, you confirm with the OTP
        sent to your Aadhaar-linked mobile, and your signature comes back here.
        Leegality receives the circular to do this.
      </p>
      {failed ? <p className="text-destructive text-sm">{failed}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy !== null}
          onClick={handleStart}
          type="button"
          variant={waiting ? "outline" : "default"}
        >
          <HugeiconsIcon
            className="size-4"
            icon={FingerPrintIcon}
            strokeWidth={2}
          />
          {busy === "start"
            ? "Opening Leegality..."
            : "Sign with Aadhaar eSign"}
        </Button>
        {waiting ? (
          <Button
            disabled={busy !== null}
            onClick={handleCheck}
            type="button"
            variant="outline"
          >
            {busy === "check" ? "Checking..." : "I've signed: check now"}
          </Button>
        ) : null}
      </div>
      {waiting ? (
        <p className="text-muted-foreground text-xs">
          Waiting for Leegality. Your signature appears here a moment after you
          sign there.
        </p>
      ) : null}
    </div>
  );
}
