import {
  ArrowRight01Icon,
  Delete02Icon,
  Edit02Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { RESOLUTION_THRESHOLD_LABELS } from "@pi-dash/shared/governance";
import {
  circularReference,
  effectSubject,
  RESOLUTION_TEMPLATES,
  tallyCircular,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { RichText } from "@/components/editor/rich-text";
import { IssueCircularDialog } from "@/components/governance/issue-circular-dialog";
import {
  epochToIso,
  formatIso,
  todayIso,
  useRegister,
} from "@/components/governance/register-data";
import {
  draftValuesFrom,
  ResolutionDraftForm,
} from "@/components/governance/resolution-draft-form";
import { ResolutionSignatures } from "@/components/governance/resolution-signatures";
import { ResolutionStatusBadge } from "@/components/governance/resolution-status";
import { effectText } from "@/components/governance/resolution-text";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { RecordDetailSkeleton } from "@/components/shared/page-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { useRecordTitle } from "@/hooks/use-record-title";
import { formatTimestamp } from "@/lib/date-formats";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute(
  "/_app/governance/resolutions/$resolutionId"
)({
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.resolution.byId({ id: params.resolutionId }),
      abortController.signal
    );
  },
  component: ResolutionPage,
  head: () => ({
    meta: [{ title: `Resolution | ${env.VITE_APP_NAME}` }],
  }),
});

function ResolutionPage() {
  const { resolutionId } = Route.useParams();
  const { hasPermission, user } = useApp();
  const canManage = hasPermission("governance.manage");
  const [row, result] = useQuery(queries.resolution.byId({ id: resolutionId }));
  useRecordTitle(row?.title);
  const today = todayIso();
  const { trustees } = useRegister(today);
  const zero = useZero();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const handleDelete = useEventCallback(async () => {
    const out = await zero.mutate(
      mutators.resolution.deleteDraft({ id: resolutionId })
    ).server;
    handleMutationResult(out, {
      entityId: resolutionId,
      errorMsg: `Couldn't delete the draft: ${getMutationResultErrorMessage(out.type === "error" ? out.error : undefined, "something went wrong")}`,
      mutation: "resolution.deleteDraft",
      successMsg: "Draft deleted",
    });
    if (out.type !== "error") {
      navigate({ to: "/governance/resolutions" });
    }
  });

  if (!row) {
    return (
      <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
        {result.type === "complete" ? (
          <p className="text-muted-foreground text-sm">
            This resolution doesn't exist, or it wasn't sent to you.
          </p>
        ) : (
          <RecordDetailSkeleton />
        )}
      </div>
    );
  }

  const template = RESOLUTION_TEMPLATES[row.templateKey];
  const names = new Map<string, string>([
    ...trustees.map((t) => [t.id, t.legalName] as const),
    ...(row.responses ?? []).map(
      (r) => [r.trusteeId, r.trustee?.legalName ?? ""] as const
    ),
  ]);
  const responses = [...(row.responses ?? [])].sort((a, b) =>
    (a.trustee?.legalName ?? "").localeCompare(b.trustee?.legalName ?? "")
  );
  const { circular } = row;
  const dueIso = epochToIso(circular?.responseDueOn ?? null);
  const waitingForMe =
    row.status === "issued" &&
    responses.some(
      (r) =>
        r.userId === user.id && r.response === "pending" && !r.conflictDeclared
    );
  const tally =
    row.status === "draft" || row.historical
      ? null
      : tallyCircular({
          dueOn: dueIso ?? today,
          responses: responses.map((r) => ({
            conflictDeclared: r.conflictDeclared ?? false,
            response: r.response ?? "pending",
            signed: !!r.signatureId,
            trusteeId: r.trusteeId,
          })),
          subjectTrusteeId: effectSubject(row.effect),
          threshold: row.threshold ?? "majority_in_office",
          today,
        });
  const effectLine = effectText(row.effect, names);
  const siblings = circular?.resolutions ?? [];

  // A meeting's resolution is decided on the meeting's page, not issued.
  const isCircularDraft = row.status === "draft" && row.kind !== "meeting";
  const menuActions = [
    row.status === "draft" &&
      canManage && {
        icon: Edit02Icon,
        id: "edit",
        label: "Edit draft",
        onSelect: () => setEditing(true),
      },
    isCircularDraft &&
      canManage && {
        destructive: true,
        icon: Delete02Icon,
        id: "delete",
        label: "Delete draft",
        onSelect: () => setDeleting(true),
      },
  ];
  const hasMenu = menuActions.some(Boolean);

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {isCircularDraft && canManage ? (
              <Button onClick={() => setIssuing(true)} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={SentIcon}
                  strokeWidth={2}
                />
                Issue
              </Button>
            ) : null}
            {circular ? (
              <Link
                className={buttonVariants({
                  variant: waitingForMe ? "default" : "outline",
                })}
                params={{ circularId: circular.id }}
                to="/governance/resolutions/circulars/$circularId"
              >
                {waitingForMe ? "Respond" : "Open circular"}
                <HugeiconsIcon
                  className="size-4"
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                />
              </Link>
            ) : null}
            {hasMenu ? (
              <PageHeaderMenu
                actions={menuActions}
                title="Resolution actions"
              />
            ) : null}
          </>
        }
        description={
          row.kind === "meeting"
            ? `${template.title} · decided at a board meeting`
            : template.title
        }
        title={row.title}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <ResolutionStatusBadge status={row.status ?? "draft"} />
        {row.number ? <span className="font-mono">{row.number}</span> : null}
        {row.status === "issued" && dueIso ? (
          <span className="text-muted-foreground">
            Respond by {formatIso(dueIso)}
          </span>
        ) : null}
        {circular ? (
          <span className="text-muted-foreground">
            {siblings.length > 1
              ? `Resolution ${row.position} of ${siblings.length} in circular ${circularReference(circular.id)}`
              : `Circular ${circularReference(circular.id)}`}
            {circular.issuedBy
              ? `, issued by ${circular.issuedBy.legalName} on ${formatTimestamp(new Date(circular.issuedAt).toISOString())}`
              : ""}
          </span>
        ) : null}
        {row.decidedOn ? (
          <span className="text-muted-foreground">
            Decided {formatIso(epochToIso(row.decidedOn))}
          </span>
        ) : null}
      </div>
      {row.outcomeNote ? (
        <p className="bg-muted/40 mt-3 rounded-md border p-3 text-sm">
          {row.outcomeNote}
        </p>
      ) : null}
      {row.validityNote ? (
        <p className="text-muted-foreground mt-3 text-sm">{row.validityNote}</p>
      ) : null}

      <div
        className={
          tally
            ? "mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
            : "mt-6"
        }
      >
        <section className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-base font-semibold">Text</h2>
          <RichText content={row.body} />
          {effectLine ? (
            <p className="text-muted-foreground border-t pt-3 text-sm">
              When it passes, the register records: {effectLine}
            </p>
          ) : null}
        </section>

        {tally ? (
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            <ResolutionSignatures
              assents={tally.assents}
              needed={tally.needed}
              objections={tally.objections}
              responses={responses}
              thresholdLabel={
                RESOLUTION_THRESHOLD_LABELS[
                  row.threshold ?? "majority_in_office"
                ]
              }
              userId={user.id}
            />
          </div>
        ) : null}
      </div>

      <Dialog onOpenChange={setEditing} open={editing}>
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>Edit draft</DialogTitle>
            <DialogDescription className="sr-only">
              Edit the draft circular
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <ResolutionDraftForm
              draftId={row.id}
              initial={draftValuesFrom(row)}
              mode="update"
              onCancel={() => setEditing(false)}
              onSaved={() => setEditing(false)}
              trustees={trustees}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {isCircularDraft && canManage ? (
        <IssueCircularDialog
          onOpenChange={setIssuing}
          open={issuing}
          startId={row.id}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Delete draft"
        description="The draft is deleted. Issued circulars can't be deleted."
        onConfirm={handleDelete}
        onOpenChange={setDeleting}
        open={deleting}
        title="Delete this draft?"
      />
    </div>
  );
}
