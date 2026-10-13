import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { useApp } from "@/context/app-context";
import {
  getPartyDetails,
  type PartyDetailsResponse,
  revealPartyIdentifier,
} from "@/functions/parties";
import { ASSESSMENT_LABELS, ID_TYPE_LABELS } from "@/lib/donor-schema";

import { activeRoleLabels, type PartyRow } from "./party-row";

type Details = PartyDetailsResponse["details"];

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

function IdentifierRow({
  details,
  partyId,
}: {
  details: NonNullable<Details>;
  partyId: string;
}) {
  const { hasPermission } = useApp();
  const reveal = useServerFn(revealPartyIdentifier);
  const [revealed, setRevealed] = useState<string | null>(null);
  const handleReveal = useEventCallback(async () => {
    try {
      const result = await reveal({ data: { partyId } });
      setRevealed(result.idNumber ?? "");
    } catch (error) {
      log.error({
        action: "donor.reveal",
        caughtError: error instanceof Error ? error.message : String(error),
        component: "DonorDetailSheet",
      });
      toast.error("Couldn't reveal the identifier");
    }
  });
  const handleHide = useEventCallback(() => setRevealed(null));
  if (details.idType === "none") {
    return <DetailRow label="ID" value={null} />;
  }
  const masked = details.hasIdNumber
    ? `•••• ${details.idNumberLast4 ?? ""}`.trim()
    : "not recorded";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">
        {ID_TYPE_LABELS[details.idType]}
      </span>
      <span className="flex items-center gap-2 text-sm">
        {revealed ?? masked}
        {details.hasIdNumber && hasPermission("finance.view_sensitive") ? (
          <Button
            onClick={revealed === null ? handleReveal : handleHide}
            size="sm"
            type="button"
            variant="outline"
          >
            {revealed === null ? "Reveal" : "Hide"}
          </Button>
        ) : null}
      </span>
    </div>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; details: Details };

export function DonorDetailSheet({
  canManage,
  onEdit,
  onOpenChange,
  open,
  party,
  /** Bumped by the page after a save so the sheet reloads. */
  version,
}: {
  canManage: boolean;
  onEdit: (party: PartyRow) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  party: PartyRow | null;
  version: number;
}) {
  const loadDetails = useServerFn(getPartyDetails);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const partyId = party?.id ?? null;
  const retry = useEventCallback(() => setAttempt((n) => n + 1));

  useEffect(() => {
    if (!(open && partyId)) {
      setState({ kind: "loading" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    loadDetails({ data: { partyId } })
      .then((response) => {
        if (!cancelled) {
          setState({ details: response.details, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "donor.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DonorDetailSheet",
        });
        if (!cancelled) {
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, partyId, version, attempt, loadDetails]);

  const handleEdit = useEventCallback(() => {
    if (party) {
      onEdit(party);
    }
  });

  if (!party) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }
  const details = state.kind === "ready" ? state.details : null;
  const address = [
    details?.addressLine1,
    details?.addressLine2,
    details?.city,
    details?.state,
    details?.pincode,
    details?.country && details.country !== "IN" ? details.country : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            canManage ? (
              <Button onClick={handleEdit} type="button" variant="outline">
                <HugeiconsIcon
                  className="size-4"
                  icon={Edit02Icon}
                  strokeWidth={2}
                />
                Edit
              </Button>
            ) : null
          }
          badge={
            <span className="flex flex-wrap gap-1">
              {activeRoleLabels(party).map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </span>
          }
          meta={[
            party.kind === "organisation" ? "Organisation" : "Person",
            party.legalName,
          ]}
          title={party.displayName}
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          {state.kind === "loading" ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : null}
          {state.kind === "error" ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-destructive text-sm">
                Couldn't load this donor's details.
              </p>
              <Button onClick={retry} size="sm" type="button" variant="outline">
                Try again
              </Button>
            </div>
          ) : null}
          {state.kind === "ready" ? (
            <>
              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Contact</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Email" value={details?.email ?? null} />
                  <DetailRow label="Phone" value={details?.phone ?? null} />
                  <DetailRow label="Address" value={address || null} />
                </div>
              </div>
              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Identity and source</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {details ? (
                    <IdentifierRow
                      details={details}
                      key={`${party.id}-${details.updatedAt}`}
                      partyId={party.id}
                    />
                  ) : (
                    <DetailRow label="ID" value={null} />
                  )}
                  <DetailRow
                    label="Source"
                    value={
                      details
                        ? ASSESSMENT_LABELS[details.foreignSourceAssessment]
                        : null
                    }
                  />
                  <DetailRow
                    label="Nationality"
                    value={details?.nationality ?? null}
                  />
                  <DetailRow
                    label="Assessment note"
                    value={details?.assessmentNote ?? null}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
