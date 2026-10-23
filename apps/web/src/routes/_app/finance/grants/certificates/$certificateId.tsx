import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Download04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { formatPaise } from "@pi-dash/shared/money";
import {
  type CertificateStepState,
  certificateStatusLabel,
  certificateSteps,
  driftLabel,
  driftRefusal,
  CANCEL_REASON_MAX,
  signatoryTitle,
  signerDue,
} from "@pi-dash/shared/utilisation-certificates";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CertificateCaPanel } from "@/components/grants/certificate-ca-panel";
import { CertificateSignPanel } from "@/components/grants/certificate-sign-panel";
import { certificateTone } from "@/components/grants/utilisation-certificates-section";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { RecordDetailSkeleton } from "@/components/shared/page-skeleton";
import {
  DetailsCard,
  DetailsRow,
  RecordDetailLayout,
  RecordSection,
} from "@/components/shared/record-detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import {
  cancelCertificateFn,
  discardCertificateFn,
  getCertificateDrift,
} from "@/functions/utilisation-certificates";
import { useRecordTitle } from "@/hooks/use-record-title";
import { DATE, formatTimestamp } from "@/lib/date-formats";
import { preloadRouteQuery } from "@/lib/route-preload";

/**
 * One utilisation certificate: its PDF, the steps from preparing to final,
 * the two trustees' signatures and the CA's certificate. Finance readers
 * open every one; the trustees who sign one open it without finance
 * permissions (the query decides, so the route has no guard).
 */
export const Route = createFileRoute(
  "/_app/finance/grants/certificates/$certificateId"
)({
  component: CertificatePage,
  head: () => ({
    meta: [{ title: `Utilisation certificate | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.utilisationCertificate.byId({ id: params.certificateId }),
      abortController.signal
    );
  },
});

const day = (iso: string) => format(parseISO(iso), DATE);

const STEP_ICON: Record<CertificateStepState, string> = {
  current: "Now",
  done: "Done",
  stopped: "Stopped",
  upcoming: "Next",
};

function fileHref(
  certificateId: string,
  file: "ca" | "latest",
  inline = false
) {
  return `/api/utilisation-certificates/${certificateId}?file=${file}${inline ? "&disposition=inline" : ""}`;
}

/**
 * What changed since this certificate was prepared, for finance and its
 * signers; null while it loads. Loaded again when the status changes.
 */
function useCertificateDrift(
  certificateId: string,
  status: string | null
): string[] | null {
  const load = useServerFn(getCertificateDrift);
  const [loaded, setLoaded] = useState<{
    changes: string[];
    key: string;
  } | null>(null);
  const live =
    status !== null && status !== "cancelled" && status !== "discarded";
  const key = `${certificateId}:${status}`;
  useEffect(() => {
    if (!live) {
      return;
    }
    let cancelled = false;
    load({ data: { id: certificateId } })
      .then((changes) => {
        if (!cancelled) {
          setLoaded({ changes, key });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "utilisationCertificate.drift",
          caughtError: error instanceof Error ? error.message : String(error),
          certificateId,
          component: "CertificatePage",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, key, live, load]);
  if (!live) {
    return [];
  }
  return loaded?.key === key ? loaded.changes : null;
}

function CertificatePage() {
  const { certificateId } = Route.useParams();
  const { hasPermission, user } = useApp();
  const canView = hasPermission("finance.view");
  const canManage = hasPermission("finance.manage");
  const [row, result] = useQuery(
    queries.utilisationCertificate.byId({ id: certificateId })
  );
  useRecordTitle(row ? `Certificate ${row.number}` : null);
  const drift = useCertificateDrift(certificateId, row?.status ?? null);
  const changes = drift ?? [];
  const discard = useServerFn(discardCertificateFn);
  const cancel = useServerFn(cancelCertificateFn);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDiscard = useEventCallback(async () => {
    setBusy(true);
    await discard({ data: { id: certificateId } })
      .then(() => {
        toast.success("Certificate discarded");
        setConfirmingDiscard(false);
      })
      .catch((error: unknown) => {
        toast.error("Couldn't discard it", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setBusy(false));
  });
  const handleCancel = useEventCallback(async () => {
    setBusy(true);
    await cancel({ data: { id: certificateId, reason } })
      .then(() => {
        toast.success("Certificate cancelled");
        setCancelling(false);
      })
      .catch((error: unknown) => {
        toast.error("Couldn't cancel it", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setBusy(false));
  });

  if (!row) {
    return (
      <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
        {result.type === "complete" ? (
          <p className="text-muted-foreground text-sm">
            This certificate doesn't exist, or it isn't yours to see.
          </p>
        ) : (
          <RecordDetailSkeleton />
        )}
      </div>
    );
  }

  const { snapshot } = row;
  const { figures, signatories } = snapshot;
  const due = signerDue(row.status);
  const myTurn =
    (due === "head" && row.headTrustee?.userId === user.id) ||
    (due === "finance" && row.financeTrustee?.userId === user.id);
  const live = row.status !== "cancelled" && row.status !== "discarded";
  const signedAt = {
    finance: row.financeSignedAt ?? null,
    head: row.headSignedAt ?? null,
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            <FilePreviewButton
              className={buttonVariants({ variant: "outline" })}
              fileName={`Utilisation certificate ${row.number}`}
              src={fileHref(certificateId, "latest", true)}
            >
              <HugeiconsIcon
                className="size-4"
                icon={ViewIcon}
                strokeWidth={2}
              />
              PDF
            </FilePreviewButton>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={fileHref(certificateId, "latest")}
            >
              <HugeiconsIcon
                className="size-4"
                icon={Download04Icon}
                strokeWidth={2}
              />
              Download
            </a>
            {canManage && live ? (
              <PageHeaderMenu
                actions={[
                  row.status === "awaiting_head"
                    ? {
                        destructive: true,
                        icon: Delete02Icon,
                        id: "discard",
                        label: "Discard certificate",
                        onSelect: () => setConfirmingDiscard(true),
                      }
                    : {
                        destructive: true,
                        icon: Cancel01Icon,
                        id: "cancel",
                        label: "Cancel certificate",
                        onSelect: () => setCancelling(true),
                      },
                ]}
                title="Certificate actions"
              />
            ) : null}
          </>
        }
        badge={
          <StatusBadge tone={certificateTone(row.status)}>
            {certificateStatusLabel(row.status, signatories)}
          </StatusBadge>
        }
        meta={[
          snapshot.grant.title,
          snapshot.grant.grantor,
          `${day(snapshot.period.from)} to ${day(snapshot.period.to)}`,
        ]}
        title={`Utilisation certificate ${row.number}`}
      />
      <div className="mt-6">
        <RecordDetailLayout
          aside={
            <DetailsCard>
              <DetailsRow label="Grant">
                {canView ? (
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    params={{ id: row.grantId }}
                    to="/finance/grants/$id"
                  >
                    {snapshot.grant.title}
                  </Link>
                ) : (
                  snapshot.grant.title
                )}
              </DetailsRow>
              <DetailsRow label="Project">{snapshot.grant.project}</DetailsRow>
              <DetailsRow label="Brought forward">
                {formatPaise(figures.broughtForwardPaise)}
              </DetailsRow>
              <DetailsRow label="Interest earned">
                {formatPaise(figures.interestPaise)}
              </DetailsRow>
              <DetailsRow label="Received">
                {formatPaise(figures.receivedPaise - figures.refundedPaise)}
              </DetailsRow>
              <DetailsRow label="Spent">
                {formatPaise(figures.spentPaise)}
              </DetailsRow>
              <DetailsRow label="Closing unspent">
                {formatPaise(figures.closingPaise)}
              </DetailsRow>
              <DetailsRow label="Prepared">
                {`${day(snapshot.preparedOn)}, ${snapshot.place}`}
              </DetailsRow>
            </DetailsCard>
          }
        >
          {row.status === "cancelled" || row.status === "discarded" ? (
            <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
              {row.status === "cancelled"
                ? `Cancelled ${formatTimestamp(row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null)}: ${row.cancelReason ?? ""}`
                : "Discarded before anyone signed. Its number stays used."}
            </p>
          ) : null}
          {changes.length > 0 ? (
            <div
              className="border-warning/30 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-sm"
              role="alert"
            >
              <p className="font-medium">
                {driftLabel(row.headSignedAt != null)}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <RecordSection title="Steps">
            <ol
              className="divide-y rounded-lg border"
              data-testid="certificate-steps"
            >
              {certificateSteps(row).map((step) => (
                <li
                  className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm"
                  data-state={step.state}
                  key={step.key}
                >
                  <span className="flex items-center gap-2">
                    {step.state === "done" ? (
                      <HugeiconsIcon
                        className="text-success-foreground size-4"
                        icon={CheckmarkCircle02Icon}
                        strokeWidth={2}
                      />
                    ) : (
                      <span className="border-control-strong size-4 rounded-full border" />
                    )}
                    {step.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {STEP_ICON[step.state]}
                  </span>
                </li>
              ))}
            </ol>
          </RecordSection>

          <RecordSection title="Signatures">
            <ul
              className="divide-y rounded-lg border"
              data-testid="certificate-signers"
            >
              {(["head", "finance"] as const).map((role) => {
                const signatory = signatories[role];
                const at = signedAt[role];
                let state = "Waiting";
                if (at) {
                  state = `Signed ${formatTimestamp(new Date(at).toISOString())}`;
                } else if (!live) {
                  state = "Not signed";
                } else if (due === role) {
                  state = "Waiting for signature";
                } else if (role === "finance") {
                  state = `After ${signatories.head.name}`;
                }
                return (
                  <li
                    className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                    key={role}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{signatory.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {signatoryTitle(role, signatory)}
                      </span>
                    </span>
                    <StatusBadge tone={at ? "success" : "neutral"}>
                      {state}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
            {myTurn ? (
              <section
                aria-label="Your signature"
                className="flex flex-col gap-3 rounded-lg border p-4"
                id="my-signature"
              >
                <h3 className="text-sm font-medium">Your signature</h3>
                <p className="text-muted-foreground text-sm">
                  {`Check the figures in the PDF, then sign as ${signatoryTitle(due === "head" ? "head" : "finance", signatories[due === "head" ? "head" : "finance"])}.`}
                </p>
                {drift === null ? (
                  <p className="text-muted-foreground text-sm" role="status">
                    Checking the figures...
                  </p>
                ) : drift.length > 0 ? (
                  <p
                    className="border-warning/30 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-sm"
                    role="alert"
                  >
                    {driftRefusal(row.headSignedAt != null)}
                  </p>
                ) : (
                  <CertificateSignPanel
                    certificateId={certificateId}
                    latestHref={fileHref(certificateId, "latest")}
                  />
                )}
              </section>
            ) : null}
          </RecordSection>

          {row.caRequired ? (
            <RecordSection title="CA certificate">
              {row.caUdin ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span className="flex flex-col">
                    <span>
                      UDIN <span className="font-mono">{row.caUdin}</span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {`Recorded ${formatTimestamp(row.caRecordedAt ? new Date(row.caRecordedAt).toISOString() : null)}`}
                    </span>
                  </span>
                  {canView ? (
                    <a
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={fileHref(certificateId, "ca")}
                    >
                      <HugeiconsIcon
                        className="size-4"
                        icon={Download04Icon}
                        strokeWidth={2}
                      />
                      CA document
                    </a>
                  ) : null}
                </div>
              ) : row.status === "awaiting_ca" && canManage ? (
                <CertificateCaPanel certificateId={certificateId} />
              ) : (
                <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
                  The grant's agreement asks for a CA's certificate. Once both
                  trustees sign, finance records its UDIN and the CA's document,
                  and the certificate is final.
                </p>
              )}
            </RecordSection>
          ) : null}
        </RecordDetailLayout>
      </div>

      <ConfirmDialog
        confirmLabel="Discard certificate"
        description={`Nobody has signed ${row.number} yet. Discarding it keeps its number in the series, marked discarded, and frees its period for a new certificate.`}
        loading={busy}
        onConfirm={handleDiscard}
        onOpenChange={setConfirmingDiscard}
        open={confirmingDiscard}
        title="Discard certificate?"
      />
      <Dialog onOpenChange={setCancelling} open={cancelling}>
        <DialogContent className="sm:max-w-(--dialog-md)">
          <DialogHeader>
            <DialogTitle>Cancel certificate</DialogTitle>
            <DialogDescription>
              {`${row.number} has a signature, so it is kept and marked cancelled with your reason. Its period is then free for a new certificate.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              maxLength={CANCEL_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCancelling(false)}
              type="button"
              variant="outline"
            >
              Keep it
            </Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={handleCancel}
              type="button"
              variant="destructive"
            >
              Cancel certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
