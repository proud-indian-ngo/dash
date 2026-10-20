import {
  Download04Icon,
  SignatureIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { RESOLUTION_THRESHOLD_LABELS } from "@pi-dash/shared/governance";
import {
  circularReference,
  effectSubject,
  SIGNATURE_METHOD_LABELS,
  tallyCircular,
} from "@pi-dash/shared/resolutions";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { CircularSignPanel } from "@/components/governance/circular-sign-panel";
import {
  epochToIso,
  formatIso,
  todayIso,
  useRegister,
} from "@/components/governance/register-data";
import { ResolutionAnswerActions } from "@/components/governance/resolution-answer-actions";
import { ResolutionStatusBadge } from "@/components/governance/resolution-status";
import {
  effectText,
  paragraphs,
} from "@/components/governance/resolution-text";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
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
import { withdrawCircularFn } from "@/functions/resolutions";
import { useRecordTitle } from "@/hooks/use-record-title";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { formatTimestamp } from "@/lib/date-formats";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute(
  "/_app/governance/resolutions/circulars/$circularId"
)({
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.circular.byId({ id: params.circularId }),
      abortController.signal
    );
  },
  component: CircularPage,
  head: () => ({
    meta: [{ title: `Circular | ${env.VITE_APP_NAME}` }],
  }),
});

interface MyResponse {
  conflictDeclared: boolean | null;
  response: string | null;
  signatureId: string | null;
}

function myAnswerLabel(mine: MyResponse, issued: boolean): string {
  if (mine.conflictDeclared) {
    return "You declared a conflict of interest";
  }
  if (mine.response === "objection") {
    return "You objected";
  }
  if (mine.signatureId) {
    return "You assented by signing";
  }
  return issued ? "Waiting for you" : "You didn't respond";
}

function CircularPage() {
  const { circularId } = Route.useParams();
  const { user } = useApp();
  const [row, result] = useQuery(queries.circular.byId({ id: circularId }));
  const ref = circularReference(circularId);
  useRecordTitle(row ? `Circular ${ref}` : null);
  const today = todayIso();
  const { trustees } = useRegister(today);
  const withdraw = useServerFn(withdrawCircularFn);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleWithdraw = useEventCallback(async () => {
    setBusy(true);
    await withdraw({ data: { circularId, reason } })
      .then(() => {
        toast.success("Circular withdrawn");
        setWithdrawing(false);
      })
      .catch((error: unknown) => {
        toast.error("Couldn't withdraw it", {
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
            This circular doesn't exist, or it wasn't sent to you.
          </p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </div>
    );
  }

  const resolutions = row.resolutions ?? [];
  const dueIso = epochToIso(row.responseDueOn);
  const open = resolutions.some((r) => r.status === "issued");
  const isIssuer = row.issuedBy?.userId === user.id;
  const names = new Map<string, string>(
    trustees.map((t) => [t.id, t.legalName] as const)
  );
  const mineOf = (r: (typeof resolutions)[number]) =>
    (r.responses ?? []).find((x) => x.userId === user.id) ?? null;
  // Signing assents to every open resolution still waiting for them.
  const assents = resolutions
    .filter((r) => {
      const mine = mineOf(r);
      return (
        r.status === "issued" &&
        mine?.response === "pending" &&
        !mine.conflictDeclared
      );
    })
    .map((r) => r.position ?? 0);
  const otherAnswers = resolutions.flatMap((r) => {
    const mine = mineOf(r);
    if (mine?.conflictDeclared) {
      return [`declared a conflict on resolution ${r.position}`];
    }
    return mine?.response === "objection"
      ? [`object to resolution ${r.position}`]
      : [];
  });
  const responders = [
    ...new Map(
      resolutions
        .flatMap((r) => r.responses ?? [])
        .map((r) => [r.trusteeId, r.trustee?.legalName ?? ""] as const)
    ),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const signatures = row.signatures ?? [];
  const fieldsPrepared = row.revisions?.[0]?.fieldsPrepared ?? true;
  const pdfHref = getProtectedAttachmentHref({
    id: circularId,
    kind: "circularPdf",
  });
  const goToSignature = () => {
    const panel = document.getElementById("my-signature");
    panel?.scrollIntoView({ block: "start" });
    panel?.focus({ preventScroll: true });
  };

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {assents.length > 0 ? (
              <Button onClick={goToSignature} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={SignatureIcon}
                  strokeWidth={2}
                />
                Sign
              </Button>
            ) : null}
            <a
              className={buttonVariants({ variant: "outline" })}
              href={pdfHref}
              rel="noreferrer"
              target="_blank"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Download04Icon}
                strokeWidth={2}
              />
              PDF
            </a>
            {open && isIssuer ? (
              <PageHeaderMenu
                actions={[
                  {
                    destructive: true,
                    icon: Undo02Icon,
                    id: "withdraw",
                    label: "Withdraw circular",
                    onSelect: () => {
                      setReason("");
                      setWithdrawing(true);
                    },
                  },
                ]}
                title="Circular actions"
              />
            ) : null}
          </>
        }
        description={`${resolutions.length === 1 ? "1 resolution" : `${resolutions.length} resolutions`}, each decided on its own`}
        title={`Circular ${ref}`}
      />

      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-3 text-sm">
        {open && dueIso ? <span>Respond by {formatIso(dueIso)}</span> : null}
        {row.issuedBy ? (
          <span>
            Issued by {row.issuedBy.legalName} on{" "}
            {formatTimestamp(new Date(row.issuedAt).toISOString())}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          {resolutions.map((r) => {
            const responses = r.responses ?? [];
            const tally = tallyCircular({
              dueOn: dueIso ?? today,
              responses: responses.map((x) => ({
                conflictDeclared: x.conflictDeclared ?? false,
                response: x.response ?? "pending",
                signed: !!x.signatureId,
                trusteeId: x.trusteeId,
              })),
              subjectTrusteeId: effectSubject(r.effect),
              threshold: r.threshold ?? "majority_in_office",
              today,
            });
            const mine = mineOf(r);
            const effectLine = effectText(r.effect, names);
            const canAnswer =
              r.status === "issued" &&
              mine?.response === "pending" &&
              !mine.conflictDeclared;
            return (
              <section
                aria-labelledby={`resolution-${r.id}`}
                className="flex flex-col gap-3 rounded-md border p-4"
                key={r.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">
                      Resolution {r.position}
                      {r.number ? ` · ${r.number}` : ""}
                    </p>
                    <h2
                      className="text-base font-semibold"
                      id={`resolution-${r.id}`}
                    >
                      <Link
                        className="underline-offset-4 hover:underline"
                        params={{ resolutionId: r.id }}
                        to="/governance/resolutions/$resolutionId"
                      >
                        {r.title}
                      </Link>
                    </h2>
                  </div>
                  <ResolutionStatusBadge status={r.status ?? "issued"} />
                </div>
                {paragraphs(r.body).map((p, i) => (
                  <p className="text-sm leading-relaxed" key={`p${String(i)}`}>
                    {p}
                  </p>
                ))}
                {effectLine ? (
                  <p className="text-muted-foreground text-sm">
                    When it passes, the register records: {effectLine}
                  </p>
                ) : null}
                {r.outcomeNote ? (
                  <p className="bg-muted/40 rounded-md border p-3 text-sm">
                    {r.outcomeNote}
                  </p>
                ) : null}
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-sm">
                  <span className="tabular-nums">
                    {tally.assents} of {tally.needed} signatures
                    {tally.objections > 0
                      ? ` · ${tally.objections} objected`
                      : ""}{" "}
                    ·{" "}
                    {
                      RESOLUTION_THRESHOLD_LABELS[
                        r.threshold ?? "majority_in_office"
                      ]
                    }
                  </span>
                  {mine ? (
                    <span>{myAnswerLabel(mine, r.status === "issued")}</span>
                  ) : null}
                </div>
                {canAnswer ? (
                  <ResolutionAnswerActions
                    position={r.position ?? 0}
                    resolutionId={r.id}
                  />
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          {assents.length > 0 ? (
            <div
              className="scroll-mt-4 outline-none"
              id="my-signature"
              tabIndex={-1}
            >
              <CircularSignPanel
                assents={assents}
                circularId={circularId}
                fieldsPrepared={fieldsPrepared}
                otherAnswers={otherAnswers}
              />
            </div>
          ) : null}
          <section
            aria-labelledby="circular-signatures-heading"
            className="flex flex-col gap-3 rounded-md border p-4"
          >
            <h2
              className="text-base font-semibold"
              id="circular-signatures-heading"
            >
              Signatures
            </h2>
            <ul className="flex flex-col divide-y">
              {responders.map(([trusteeId, legalName]) => {
                const signature = signatures.find(
                  (s) => s.trusteeId === trusteeId
                );
                const own = resolutions
                  .map((r) =>
                    (r.responses ?? []).find((x) => x.trusteeId === trusteeId)
                  )
                  .filter((x) => x !== undefined);
                const isMe = own.some((x) => x.userId === user.id);
                const declined = own.every(
                  (x) => x.conflictDeclared || x.response === "objection"
                );
                return (
                  <li className="flex flex-col gap-1 py-2.5" key={trusteeId}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {legalName}
                        {isMe ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (you)
                          </span>
                        ) : null}
                      </span>
                      {signature ? (
                        <StatusBadge tone="success">Signed</StatusBadge>
                      ) : (
                        <StatusBadge tone={declined ? "danger" : "neutral"}>
                          {declined
                            ? "Didn't sign"
                            : open
                              ? "Waiting"
                              : "Didn't respond"}
                        </StatusBadge>
                      )}
                    </div>
                    {signature ? (
                      <p className="text-muted-foreground text-xs text-pretty">
                        {[
                          SIGNATURE_METHOD_LABELS[signature.method],
                          signature.signingTime
                            ? formatTimestamp(
                                new Date(signature.signingTime).toISOString()
                              )
                            : null,
                          signature.answers,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <Dialog onOpenChange={setWithdrawing} open={withdrawing}>
        <DialogContent className="sm:max-w-(--dialog-md)">
          <DialogHeader>
            <DialogTitle>Withdraw this circular</DialogTitle>
            <DialogDescription>
              Every resolution in it that isn't decided yet stops collecting
              responses and stays on record as withdrawn. Ones already passed or
              failed stay as they are. To change the text, draft a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withdraw-reason">Reason</Label>
            <Textarea
              id="withdraw-reason"
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setWithdrawing(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={handleWithdraw}
              type="button"
              variant="destructive"
            >
              Withdraw circular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
