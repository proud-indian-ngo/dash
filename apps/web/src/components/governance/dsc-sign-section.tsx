import { Key01Icon, SignatureIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getMyDscStatus,
  getSigningJobStatus,
  startDscEnrolmentFn,
  startDscSigningFn,
} from "@/functions/signing";

import { formatIso } from "./register-data";

type DscStatus = Awaited<ReturnType<typeof getMyDscStatus>>;

const POLL_MS = 2000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

/**
 * Opens a `pidash-sign://` link and waits for the helper to finish the
 * job, polling its status. Resolves with the job's outcome.
 */
function useHelperJob() {
  const poll = useServerFn(getSigningJobStatus);
  const cancelled = useRef(false);
  useEffect(() => {
    // StrictMode mounts twice in development; reset after its first cleanup.
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  return useEventCallback(
    async (start: () => Promise<{ jobId: string; link: string }>) => {
      const { jobId, link } = await start();
      window.location.href = link;
      const started = Date.now();
      while (!cancelled.current && Date.now() - started < POLL_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const status = await poll({ data: { jobId } });
        if (status.status !== "pending") {
          return status;
        }
      }
      return {
        error: "The helper didn't answer in time.",
        status: "failed" as const,
      };
    }
  );
}

/** Sign with the DSC helper, or set it up first. */
export function DscSignSection({
  onAvailability,
  onVote,
  resolutionId,
}: {
  /** Whether the helper can be used here, once the status has loaded. */
  onAvailability: (available: boolean) => void;
  /** Runs an action through the recent-sign-in check. */
  onVote: <T>(action: () => Promise<T>) => Promise<T | null>;
  resolutionId: string;
}) {
  const loadStatus = useServerFn(getMyDscStatus);
  const enrol = useServerFn(startDscEnrolmentFn);
  const sign = useServerFn(startDscSigningFn);
  const runJob = useHelperJob();
  const [status, setStatus] = useState<DscStatus | null>(null);
  const [busy, setBusy] = useState<"enrol" | "sign" | null>(null);

  const refresh = useEventCallback(() => {
    loadStatus()
      .then((next) => {
        setStatus(next);
        onAvailability(next.helperAvailable);
      })
      .catch((error: unknown) => {
        log.error({
          action: "dsc.status",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DscSignSection",
        });
      });
  });
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleEnrol = useEventCallback(async () => {
    setBusy("enrol");
    await runJob(() => enrol())
      .then((outcome) => {
        if (outcome.status === "completed") {
          toast.success("Your DSC is set up");
          refresh();
        } else {
          toast.error("Your DSC wasn't set up", {
            description: outcome.error ?? undefined,
          });
        }
      })
      .catch((error: unknown) => {
        toast.error("Couldn't start the helper", {
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => setBusy(null));
  });

  const handleSign = useEventCallback(async () => {
    setBusy("sign");
    await onVote(() => runJob(() => sign({ data: { resolutionId } })))
      .then((outcome) => {
        if (!outcome) {
          return;
        }
        if (outcome.status === "completed") {
          toast.success("Signed with your DSC");
        } else {
          toast.error("Your signature wasn't added", {
            description: outcome.error ?? undefined,
          });
        }
      })
      .catch((error: unknown) => {
        toast.error("Couldn't sign", {
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => setBusy(null));
  });

  if (!status?.helperAvailable) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {status.certificate ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Button
              className="w-full"
              disabled={busy !== null}
              onClick={handleSign}
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={SignatureIcon}
                strokeWidth={2}
              />
              {busy === "sign"
                ? "Waiting for the helper..."
                : "Sign with your DSC"}
            </Button>
            <span className="text-muted-foreground text-xs">
              {status.certificate.subject} · valid until{" "}
              {formatIso(status.certificate.notAfter.slice(0, 10))}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            The signing helper asks for your token PIN; the PIN never leaves
            your laptop.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm">
            To sign here, set up your DSC once: plug in your token and the
            helper registers its certificate with pi-dash.
          </p>
          <div>
            <Button
              disabled={busy !== null}
              onClick={handleEnrol}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Key01Icon}
                strokeWidth={2}
              />
              {busy === "enrol"
                ? "Waiting for the helper..."
                : "Set up your DSC"}
            </Button>
          </div>
        </>
      )}
      <p className="text-muted-foreground text-xs">
        First time?{" "}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to="/governance/signing-helper"
        >
          Install the signing helper
        </Link>
        .
      </p>
    </div>
  );
}
