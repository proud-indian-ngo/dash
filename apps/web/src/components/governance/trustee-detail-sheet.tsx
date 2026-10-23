import {
  Add01Icon,
  Calendar01Icon,
  Delete02Icon,
  Edit02Icon,
  Logout03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { revealErrorMessage } from "@pi-dash/shared/encrypted-values";
import {
  isHeldOn,
  lastDayOf,
  TRUSTEE_CESSATION_BASIS_LABELS,
  TRUSTEE_OFFICE_LABELS,
  TRUSTEE_TERM_BASIS_LABELS,
  type TrusteeCessationBasis,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import {
  deleteTrusteeFn,
  getTrusteeDetails,
  revealTrusteeKycFn,
  type TrusteeDetailsResponse,
} from "@/functions/governance";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { type DocumentOption, EvidenceLink } from "./evidence";
import {
  OfficeDialog,
  type OfficeDialogState,
  TermDialog,
  type TermDialogState,
} from "./period-dialogs";
import { formatIso, type RegisterTrustee, todayIso } from "./register-data";

type Details = TrusteeDetailsResponse["details"];

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

function KycRows({
  details,
  trusteeId,
}: {
  details: NonNullable<Details>;
  trusteeId: string;
}) {
  const { hasPermission } = useApp();
  const reveal = useServerFn(revealTrusteeKycFn);
  const [revealed, setRevealed] = useState<{
    aadhaarReference: string | null;
    pan: string | null;
  } | null>(null);
  const handleReveal = useEventCallback(async () => {
    try {
      setRevealed(await reveal({ data: { trusteeId } }));
    } catch (error) {
      log.error({
        action: "trustee.kyc.reveal",
        caughtError: error instanceof Error ? error.message : String(error),
        component: "TrusteeDetailSheet",
      });
      toast.error(
        revealErrorMessage(
          error,
          "PAN or Aadhaar reference",
          "Couldn't reveal the KYC details"
        )
      );
    }
  });
  const handleHide = useEventCallback(() => setRevealed(null));
  const masked = (stored: boolean, last4: string | null) =>
    stored ? `•••• ${last4 ?? ""}`.trim() : "not recorded";
  const canReveal =
    (details.hasPan || details.hasAadhaarReference) &&
    hasPermission("governance.kyc.view");
  return (
    <>
      <DetailRow label="Name on PAN" value={details.panName} />
      <DetailRow
        label="PAN"
        value={revealed?.pan ?? masked(details.hasPan, details.panLast4)}
      />
      <DetailRow label="Name on Aadhaar" value={details.aadhaarName} />
      <DetailRow
        label="Aadhaar number or Virtual ID"
        value={
          revealed?.aadhaarReference ??
          masked(details.hasAadhaarReference, details.aadhaarLast4)
        }
      />
      {canReveal ? (
        <div>
          <Button
            onClick={revealed === null ? handleReveal : handleHide}
            size="sm"
            type="button"
            variant="outline"
          >
            {revealed === null ? "Reveal PAN and Aadhaar" : "Hide"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

type Term = RegisterTrustee["terms"][number];
type Office = RegisterTrustee["offices"][number];

function periodText(startsOn: string, last: string | null, open: boolean) {
  if (last) {
    return `${formatIso(startsOn)} to ${formatIso(last)}`;
  }
  return open ? `From ${formatIso(startsOn)}, for life` : formatIso(startsOn);
}

function PeriodCard({
  actions,
  children,
  title,
  subtitle,
}: {
  actions: ReactNode;
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{subtitle}</span>
        </div>
        {actions}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </li>
  );
}

type Removal = {
  id: string;
  kind: "term" | "office" | "trustee";
  label: string;
};

export function TrusteeDetailSheet({
  canManage,
  documents,
  onEdit,
  onOpenChange,
  open,
  trustee,
  version,
}: {
  canManage: boolean;
  documents: readonly DocumentOption[];
  onEdit: (trustee: RegisterTrustee) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trustee: RegisterTrustee | null;
  /** Bumped by the page after a save so the sheet reloads. */
  version: number;
}) {
  const zero = useZero();
  const loadDetails = useServerFn(getTrusteeDetails);
  const removeTrustee = useServerFn(deleteTrusteeFn);
  const [details, setDetails] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { details: Details; kind: "ready" }
  >({ kind: "loading" });
  const [termDialog, setTermDialog] = useState<TermDialogState | null>(null);
  const [officeDialog, setOfficeDialog] = useState<OfficeDialogState | null>(
    null
  );
  const trusteeId = trustee?.id ?? null;

  useEffect(() => {
    if (!(open && trusteeId && canManage)) {
      return;
    }
    let cancelled = false;
    setDetails({ kind: "loading" });
    loadDetails({ data: { trusteeId } })
      .then((response) => {
        if (!cancelled) {
          setDetails({ details: response.details, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "trustee.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "TrusteeDetailSheet",
        });
        if (!cancelled) {
          setDetails({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, trusteeId, canManage, version, loadDetails]);

  const handleEdit = useEventCallback(() => trustee && onEdit(trustee));
  const closeTermDialog = useEventCallback(() => setTermDialog(null));
  const closeOfficeDialog = useEventCallback(() => setOfficeDialog(null));
  const removal = useConfirmAction<Removal>({
    onConfirm: async (target) => {
      if (target.kind === "trustee") {
        try {
          await removeTrustee({ data: { trusteeId: target.id } });
        } catch (error) {
          toast.error(
            `Couldn't delete: ${error instanceof Error ? error.message : "something went wrong"}`
          );
          return { type: "error" };
        }
        toast.success("Trustee deleted");
        onOpenChange(false);
        return { type: "success" };
      }
      const result =
        target.kind === "term"
          ? await zero.mutate(mutators.trusteeTerm.remove({ id: target.id }))
              .server
          : await zero.mutate(mutators.trusteeOffice.remove({ id: target.id }))
              .server;
      handleMutationResult(result, {
        entityId: target.id,
        errorMsg: `Couldn't delete: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation:
          target.kind === "term"
            ? "trusteeTerm.remove"
            : "trusteeOffice.remove",
        successMsg: "Deleted",
      });
      return result;
    },
  });
  const closeRemoval = useEventCallback((next: boolean) => {
    if (!next) {
      removal.cancel();
    }
  });

  if (!trustee) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  const today = todayIso();
  const inOffice = trustee.terms.some((t) => isHeldOn(t, today));
  let statusLabel = "Former trustee";
  if (inOffice) {
    statusLabel = "In office";
  } else if (trustee.terms.length === 0) {
    statusLabel = "No term recorded";
  } else if (trustee.terms.every((t) => t.startsOn > today)) {
    statusLabel = "Term not started";
  }
  const termActions = (term: Term) =>
    canManage ? (
      <ResponsiveActionMenu
        actions={[
          {
            icon: Edit02Icon,
            id: "correct",
            label: "Correct",
            onSelect: () => setTermDialog({ mode: "edit", term, trustee }),
          },
          term.endedOn === null && {
            icon: Logout03Icon,
            id: "end",
            label: "Record cessation",
            onSelect: () => setTermDialog({ mode: "end", term, trustee }),
          },
          {
            destructive: true,
            icon: Delete02Icon,
            id: "delete",
            label: "Delete",
            onSelect: () =>
              removal.trigger({
                id: term.id,
                kind: "term",
                label: `the term from ${formatIso(term.startsOn)}`,
              }),
          },
        ]}
        title="Term actions"
        trigger={<RowActionsButton />}
      />
    ) : null;
  const officeActions = (office: Office) =>
    canManage ? (
      <ResponsiveActionMenu
        actions={[
          {
            icon: Edit02Icon,
            id: "correct",
            label: "Correct",
            onSelect: () => setOfficeDialog({ mode: "edit", office, trustee }),
          },
          office.endedOn === null && {
            icon: Logout03Icon,
            id: "end",
            label: "End office",
            onSelect: () => setOfficeDialog({ mode: "end", office, trustee }),
          },
          {
            destructive: true,
            icon: Delete02Icon,
            id: "delete",
            label: "Delete",
            onSelect: () =>
              removal.trigger({
                id: office.id,
                kind: "office",
                label: `${TRUSTEE_OFFICE_LABELS[office.office]} from ${formatIso(office.startsOn)}`,
              }),
          },
        ]}
        title="Office actions"
        trigger={<RowActionsButton />}
      />
    ) : null;

  const ready = details.kind === "ready" ? details.details : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            canManage ? (
              <span className="flex items-center gap-2">
                <Button onClick={handleEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
                <PageHeaderMenu
                  actions={[
                    {
                      destructive: true,
                      icon: Delete02Icon,
                      id: "delete",
                      label: "Delete trustee",
                      onSelect: () =>
                        removal.trigger({
                          id: trustee.id,
                          kind: "trustee",
                          label: trustee.legalName,
                        }),
                    },
                  ]}
                  title={trustee.legalName}
                />
              </span>
            ) : null
          }
          badge={
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={inOffice ? "success" : "neutral"}>
                {statusLabel}
              </StatusBadge>
              {trustee.isCoFounder ? <Tag>Co-Founder</Tag> : null}
            </span>
          }
          meta={[trustee.userId ? "Has an account" : "No account"]}
          title={trustee.legalName}
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Terms as trustee</h3>
              {canManage ? (
                <Button
                  onClick={() => setTermDialog({ mode: "create", trustee })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Add01Icon}
                    strokeWidth={2}
                  />
                  Add term
                </Button>
              ) : null}
            </div>
            {trustee.terms.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No terms recorded.
              </p>
            ) : null}
            {trustee.terms.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {trustee.terms.map((term) => (
                  <PeriodCard
                    actions={termActions(term)}
                    key={term.id}
                    subtitle={TRUSTEE_TERM_BASIS_LABELS[term.basis]}
                    title={periodText(
                      term.startsOn,
                      lastDayOf(term),
                      term.endsOn === null && term.endedOn === null
                    )}
                  >
                    <DetailRow
                      label="Start evidence"
                      value={
                        <EvidenceLink
                          documentId={term.startEvidenceDocumentId}
                          documents={documents}
                        />
                      }
                    />
                    <DetailRow
                      label="Acceptance (clause 4.24)"
                      value={
                        term.acceptanceDocumentId ? (
                          <EvidenceLink
                            documentId={term.acceptanceDocumentId}
                            documents={documents}
                          />
                        ) : null
                      }
                    />
                    {term.endedOn ? (
                      <>
                        <DetailRow
                          label="Ceased"
                          value={`${formatIso(term.endedOn)} · ${
                            term.cessationBasis
                              ? TRUSTEE_CESSATION_BASIS_LABELS[
                                  term.cessationBasis as TrusteeCessationBasis
                                ]
                              : ""
                          }`}
                        />
                        <DetailRow
                          label="End evidence"
                          value={
                            <EvidenceLink
                              documentId={term.endEvidenceDocumentId}
                              documents={documents}
                            />
                          }
                        />
                      </>
                    ) : null}
                    {term.validityNote ? (
                      <DetailRow
                        label="Validity note"
                        value={term.validityNote}
                      />
                    ) : null}
                  </PeriodCard>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Offices</h3>
              {canManage ? (
                <Button
                  onClick={() => setOfficeDialog({ mode: "create", trustee })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Calendar01Icon}
                    strokeWidth={2}
                  />
                  Add office
                </Button>
              ) : null}
            </div>
            {trustee.offices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No offices held.</p>
            ) : null}
            {trustee.offices.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {trustee.offices.map((office) => (
                  <PeriodCard
                    actions={officeActions(office)}
                    key={office.id}
                    subtitle={periodText(
                      office.startsOn,
                      lastDayOf(office),
                      false
                    )}
                    title={TRUSTEE_OFFICE_LABELS[office.office]}
                  >
                    <DetailRow
                      label="Start evidence"
                      value={
                        <EvidenceLink
                          documentId={office.startEvidenceDocumentId}
                          documents={documents}
                        />
                      }
                    />
                    {office.endedOn ? (
                      <DetailRow
                        label="End evidence"
                        value={
                          <EvidenceLink
                            documentId={office.endEvidenceDocumentId}
                            documents={documents}
                          />
                        }
                      />
                    ) : null}
                    {office.validityNote ? (
                      <DetailRow
                        label="Validity note"
                        value={office.validityNote}
                      />
                    ) : null}
                  </PeriodCard>
                ))}
              </ul>
            ) : null}
          </section>

          {canManage ? (
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Contact and KYC</h3>
              {details.kind === "loading" ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-64" />
                </div>
              ) : null}
              {details.kind === "error" ? (
                <p className="text-destructive text-sm">
                  Couldn't load the contact and KYC details.
                </p>
              ) : null}
              {details.kind === "ready" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Email" value={ready?.email} />
                  <DetailRow label="Phone" value={ready?.phone} />
                  <DetailRow label="Address" value={ready?.address} />
                  {ready ? (
                    <KycRows details={ready} trusteeId={trustee.id} />
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <TermDialog
          documents={documents}
          onOpenChange={closeTermDialog}
          state={termDialog}
        />
        <OfficeDialog
          documents={documents}
          onOpenChange={closeOfficeDialog}
          state={officeDialog}
        />
        <ConfirmDialog
          confirmLabel={
            removal.payload?.kind === "trustee"
              ? "Delete trustee"
              : removal.payload?.kind === "office"
                ? "Delete office"
                : "Delete term"
          }
          description={
            removal.payload?.kind === "trustee"
              ? `Delete ${removal.payload.label} and their contact and KYC details? Use this only for a trustee added by mistake. A trustee with terms, offices, meeting attendance, votes, signatures, declarations or a DSC enrolment on record can't be deleted.`
              : `Delete ${removal.payload?.label ?? "this record"}? Use this only for something entered by mistake; to record that it ended, use the end action instead.`
          }
          loading={removal.isLoading}
          loadingLabel="Deleting..."
          onConfirm={removal.confirm}
          onOpenChange={closeRemoval}
          open={removal.isOpen}
          title="Delete this record?"
        />
      </SheetContent>
    </Sheet>
  );
}
