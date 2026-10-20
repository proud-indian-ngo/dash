import {
  Delete02Icon,
  Download04Icon,
  Edit02Icon,
  SentIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  addDays,
  RESOLUTION_THRESHOLD_LABELS,
} from "@pi-dash/shared/governance";
import {
  DEFAULT_RESPONSE_DAYS,
  effectSubject,
  RESOLUTION_TEMPLATES,
  type ResolutionEffect,
  SIGNATURE_METHOD_LABELS,
  tallyCircular,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

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
import { ResolutionResponsePanel } from "@/components/governance/resolution-response-panel";
import { ResolutionStatusBadge } from "@/components/governance/resolution-status";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import {
  issueResolutionFn,
  withdrawResolutionFn,
} from "@/functions/resolutions";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { formatTimestamp } from "@/lib/date-formats";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

export const Route = createFileRoute(
  "/_app/governance/resolutions/$resolutionId"
)({
  component: ResolutionPage,
  head: () => ({
    meta: [{ title: `Resolution | ${env.VITE_APP_NAME}` }],
  }),
});

function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function effectText(
  effect: ResolutionEffect,
  names: Map<string, string>
): string | null {
  const who =
    effect.type === "none" ? "" : (names.get(effect.trusteeId) ?? "A trustee");
  switch (effect.type) {
    case "none":
      return null;
    case "term_start":
      return `${who} becomes a trustee from ${formatIso(effect.startsOn)}${effect.endsOn ? ` to ${formatIso(effect.endsOn)}` : " for life"}.`;
    case "term_end":
      return `${who} ceases to be a trustee from ${formatIso(effect.endedOn)}, and their offices end.`;
    case "office_start":
      return `${who} holds the office from ${formatIso(effect.startsOn)}; the previous holder's office ends that day.`;
    case "removal":
      return `${who} is removed from ${formatIso(effect.endedOn)} (hearing on ${formatIso(effect.hearingOn)}).`;
    default:
      return null;
  }
}

function ResolutionPage() {
  const { resolutionId } = Route.useParams();
  const { hasPermission, user } = useApp();
  const canManage = hasPermission("governance.manage");
  const [row, result] = useQuery(queries.resolution.byId({ id: resolutionId }));
  const today = todayIso();
  const { trustees } = useRegister(today);
  const zero = useZero();
  const navigate = useNavigate();
  const issue = useServerFn(issueResolutionFn);
  const withdraw = useServerFn(withdrawResolutionFn);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [dueOn, setDueOn] = useState(() =>
    addDays(today, DEFAULT_RESPONSE_DAYS)
  );
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");

  const handleIssue = useEventCallback(async () => {
    setBusy(true);
    await issue({ data: { id: resolutionId, responseDueOn: dueOn } })
      .then((out) => {
        toast.success(`Issued to ${out.responders} trustees`);
        setIssuing(false);
      })
      .catch((error: unknown) => {
        toast.error("Couldn't issue it", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setBusy(false));
  });
  const handleWithdraw = useEventCallback(async () => {
    setBusy(true);
    await withdraw({ data: { id: resolutionId, reason } })
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
          <Skeleton className="h-40 w-full" />
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
  // The open one first, should the account have moved between trustees.
  const mine =
    responses.find(
      (r) =>
        r.userId === user.id && r.response === "pending" && !r.conflictDeclared
    ) ??
    responses.find((r) => r.userId === user.id) ??
    null;
  const dueIso = epochToIso(row.responseDueOn ?? null);
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
  const isIssuer = row.issuedBy?.userId === user.id;
  const effectLine = effectText(row.effect, names);
  const pdfHref = getProtectedAttachmentHref({
    id: row.id,
    kind: "resolutionPdf",
  });
  const fieldsPrepared = row.revisions?.[0]?.fieldsPrepared ?? true;

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
    row.status === "issued" &&
      isIssuer && {
        destructive: true,
        icon: Undo02Icon,
        id: "withdraw",
        label: "Withdraw circular",
        onSelect: () => setWithdrawing(true),
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
            {row.status !== "draft" && !row.historical ? (
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
        {row.issuedBy ? (
          <span className="text-muted-foreground">
            Issued by {row.issuedBy.legalName} on{" "}
            {row.issuedAt
              ? formatTimestamp(new Date(row.issuedAt).toISOString())
              : "—"}
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

      {mine &&
      row.status === "issued" &&
      mine.response === "pending" &&
      !mine.conflictDeclared ? (
        <div className="mt-6">
          <ResolutionResponsePanel
            fieldsPrepared={fieldsPrepared}
            resolutionId={row.id}
          />
        </div>
      ) : null}

      <section className="mt-6 flex flex-col gap-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Text</h2>
        {paragraphs(row.body).map((p, i) => (
          <p className="text-sm leading-relaxed" key={`p${String(i)}`}>
            {p}
          </p>
        ))}
        {effectLine ? (
          <p className="text-muted-foreground border-t pt-3 text-sm">
            When it passes, the register records: {effectLine}
          </p>
        ) : null}
      </section>

      {tally ? (
        <section className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Responses</h2>
            <p className="text-muted-foreground text-sm">
              {
                RESOLUTION_THRESHOLD_LABELS[
                  row.threshold ?? "majority_in_office"
                ]
              }
              : {tally.assents} of {tally.needed} signatures
              {tally.objections > 0 ? `, ${tally.objections} objected` : ""}
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trustee</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.map((r) => {
                  let label = "Waiting";
                  let tone: "neutral" | "success" | "danger" | "warning" =
                    "neutral";
                  if (r.conflictDeclared) {
                    label = "Conflict declared";
                    tone = "warning";
                  } else if (r.response === "assent") {
                    label = "Signed";
                    tone = "success";
                  } else if (r.response === "objection") {
                    label = "Objected";
                    tone = "danger";
                  }
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.trustee?.legalName}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={tone}>{label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.signature
                          ? `${SIGNATURE_METHOD_LABELS[r.signature.method]} · ${r.signature.signerName ?? ""}${r.signature.signingTime ? ` · ${formatTimestamp(new Date(r.signature.signingTime).toISOString())}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.reason ?? r.conflictNote ?? ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

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

      <Dialog onOpenChange={setIssuing} open={issuing}>
        <DialogContent className="sm:max-w-(--dialog-md)">
          <DialogHeader>
            <DialogTitle>Issue this circular</DialogTitle>
            <DialogDescription>
              The text is fixed and a PDF with a signature box for every trustee
              in office goes to each of them. Only the Managing Trustee can
              issue it (clause 4.18).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="response-due">Respond by</Label>
            <Input
              id="response-due"
              min={addDays(today, 1)}
              onChange={(e) => setDueOn(e.target.value)}
              type="date"
              value={dueOn}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setIssuing(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={handleIssue} type="button">
              {busy ? "Issuing..." : "Issue to the trustees"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setWithdrawing} open={withdrawing}>
        <DialogContent className="sm:max-w-(--dialog-md)">
          <DialogHeader>
            <DialogTitle>Withdraw this circular</DialogTitle>
            <DialogDescription>
              It stops collecting responses and stays on record as withdrawn. To
              change the text, draft a new one.
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
          <div className="flex justify-end gap-2">
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
              Withdraw
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
