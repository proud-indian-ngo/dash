import { Key01Icon, SignatureIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type JobStatus,
  launchHelper,
  type WatchOptions,
  watchJob,
} from "@signr/browser";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getMyDscStatus,
  getSigningJobStatus,
  startDscCertificateSigningFn,
  startDscDeclarationSigningFn,
  startDscEnrolmentFn,
  startDscMinutesSigningFn,
  startDscSigningFn,
} from "@/functions/signing";

import { formatIso } from "./register-data";

/** Accepts http://localhost job URLs too, in development and E2E builds only. */
const allowInsecureOrigins =
  import.meta.env.DEV || import.meta.env.VITE_E2E === "true";

type DscStatus = Awaited<ReturnType<typeof getMyDscStatus>>;

/**
 * How a job is watched: `setNotClaimed(true)` when no helper claimed it
 * within a few seconds, and back to false as soon as one does (the
 * first-contact trust dialog can hold the claim past that).
 */
export function helperJobWatch(
  getStatus: () => Promise<JobStatus>,
  signal: AbortSignal,
  setNotClaimed: (notClaimed: boolean) => void
): WatchOptions {
  return {
    getStatus,
    onChange: (status) => {
      if (status.state !== "pending") {
        setNotClaimed(false);
      }
    },
    onNotClaimed: () => setNotClaimed(true),
    signal,
  };
}

/**
 * Opens a `signr://` link and watches the job until the helper finishes
 * it. Resolves with the job's final status, or null once the page is left
 * or shows another document (the router keeps this component when only the
 * ID changes): the job may still finish, so nothing is reported, not even
 * an error, and a link that arrives after it isn't opened. `notClaimed`
 * says no helper opened the job within a few seconds; the job stays open
 * meanwhile, so a helper installed now still picks it up.
 */
function useHelperJob(targetKey: string) {
  const poll = useServerFn(getSigningJobStatus);
  const [notClaimed, setNotClaimed] = useState(false);
  const watching = useRef<AbortController | null>(null);
  useEffect(() => () => watching.current?.abort(), [targetKey]);
  const run = useEventCallback(
    async (start: () => Promise<{ link: string; token: string }>) => {
      watching.current?.abort();
      const controller = new AbortController();
      watching.current = controller;
      setNotClaimed(false);
      try {
        const { link, token } = await start();
        if (controller.signal.aborted) {
          return null;
        }
        launchHelper(link, { allowInsecureOrigins });
        const status = await watchJob(
          helperJobWatch(
            () => poll({ data: { token } }),
            controller.signal,
            setNotClaimed
          )
        );
        setNotClaimed(false);
        return status;
      } catch (error) {
        // A newer run owns the prompt; leaving or moving on clears it.
        if (watching.current === controller) {
          setNotClaimed(false);
        }
        if (controller.signal.aborted) {
          return null;
        }
        throw error;
      }
    }
  );
  return { notClaimed, run };
}

/**
 * Sign a circular, as the chair a meeting's minutes, your own declaration
 * of interests, or a grant's utilisation certificate with the DSC helper, or
 * set it up first.
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
    | { certificateId: string }
    | { circularId: string }
    | { declarationId: string }
    | { meetingId: string };
}) {
  const loadStatus = useServerFn(getMyDscStatus);
  const enrol = useServerFn(startDscEnrolmentFn);
  const signCircular = useServerFn(startDscSigningFn);
  const signMinutes = useServerFn(startDscMinutesSigningFn);
  const signDeclaration = useServerFn(startDscDeclarationSigningFn);
  const signCertificate = useServerFn(startDscCertificateSigningFn);
  const { notClaimed, run: runJob } = useHelperJob(JSON.stringify(target));
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
        if (outcome.state === "completed") {
          toast.success("Your DSC is set up");
          refresh();
        } else {
          toast.error("Your DSC wasn't set up", {
            description: outcome.message,
          });
        }
      })
      .catch((error: unknown) => {
        toast.error("Your DSC wasn't set up", {
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
        if ("certificateId" in target) {
          return signCertificate({ data: target });
        }
        return signCircular({ data: target });
      })
    )
      .then((outcome) => {
        if (!outcome) {
          return;
        }
        if (outcome.state === "completed") {
          toast.success("Signed with your DSC");
        } else {
          toast.error("Your signature wasn't added", {
            description: outcome.message,
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
      {notClaimed ? (
        <p className="text-sm" role="status">
          The signing helper didn't open.{" "}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to="/governance/resolutions/signing-helper"
          >
            Install the signing helper
          </Link>
          , then open it: it picks up this request for 15 minutes.
        </p>
      ) : (
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
      )}
    </div>
  );
}
