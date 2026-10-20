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
  startDscDeclarationSigningFn,
  startDscEnrolmentFn,
  startDscMinutesSigningFn,
  startDscSigningFn,
} from "@/functions/signing";

import { formatIso } from "./register-data";

type DscStatus = Awaited<ReturnType<typeof getMyDscStatus>>;

const POLL_MS = 2000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

/**
 * Opens a `pidash-sign://` link and waits for the helper to finish the
 * job, polling its status. Resolves with the job's outcome, or null once
 * the page is left or shows another document (the router keeps this
 * component when only the ID changes): the job may still finish, so
 * nothing is reported, not even an error, and a link that arrives after
 * it isn't opened.
 */
function useHelperJob(targetKey: string) {
  const poll = useServerFn(getSigningJobStatus);
  // Each wait remembers the run it started in; leaving or moving to
  // another document starts a new one, so the old wait goes quiet.
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current += 1;
    },
    [targetKey]
  );
  const follow = useEventCallback(
    async (
      start: () => Promise<{ jobId: string; link: string }>,
      stale: () => boolean
    ) => {
      const { jobId, link } = await start();
      if (stale()) {
        return null;
      }
      window.location.href = link;
      const started = Date.now();
      while (Date.now() - started < POLL_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (stale()) {
          return null;
        }
        const status = await poll({ data: { jobId } });
        if (stale()) {
          return null;
        }
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
  return useEventCallback(
    (start: () => Promise<{ jobId: string; link: string }>) => {
      const mine = run.current;
      const stale = () => run.current !== mine;
      return follow(start, stale).catch((error: unknown) => {
        if (stale()) {
          return null;
        }
        throw error;
      });
    }
  );
}

/**
 * Sign a circular, as the chair a meeting's minutes, or your own
 * declaration of interests with the DSC helper, or set it up first.
 */
export function DscSignSection({
  onAvailability,
  onVote,
  target,
}: {
  /** Whether the helper can be used here, once the status has loaded. */
  onAvailability: (available: boolean) => void;
  /** Runs an action through the recent-sign-in check. */
  onVote: <T>(action: () => Promise<T>) => Promise<T | null>;
  target:
    | { circularId: string }
    | { declarationId: string }
    | { meetingId: string };
}) {
  const loadStatus = useServerFn(getMyDscStatus);
  const enrol = useServerFn(startDscEnrolmentFn);
  const signCircular = useServerFn(startDscSigningFn);
  const signMinutes = useServerFn(startDscMinutesSigningFn);
  const signDeclaration = useServerFn(startDscDeclarationSigningFn);
  const runJob = useHelperJob(JSON.stringify(target));
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
        if (!outcome) {
          return;
        }
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
    await onVote(() =>
      runJob(() => {
        if ("meetingId" in target) {
          return signMinutes({ data: target });
        }
        if ("declarationId" in target) {
          return signDeclaration({ data: target });
        }
        return signCircular({ data: target });
      })
    )
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
            helper registers its certificate with the dashboard.
          </p>
          <Button
            className="w-full"
            disabled={busy !== null}
            onClick={handleEnrol}
            type="button"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Key01Icon}
              strokeWidth={2}
            />
            {busy === "enrol" ? "Waiting for the helper..." : "Set up your DSC"}
          </Button>
        </>
      )}
      <p className="text-muted-foreground text-xs">
        First time?{" "}
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to="/governance/resolutions/signing-helper"
        >
          Install the signing helper
        </Link>
        .
      </p>
    </div>
  );
}
