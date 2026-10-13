import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { useApp } from "@/context/app-context";
import { getPartyDetails, revealPartyIdentifier } from "@/functions/parties";

import { activeRoleLabels, type PartyRow } from "./party-row";

type Details = Awaited<ReturnType<typeof getPartyDetails>>;

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
  details: Details;
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
      toast.error("Couldn't reveal the identifier", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });
  if (!details || details.idType === "none") {
    return <DetailRow label="ID" value={null} />;
  }
  const masked = details.idNumberLast4
    ? `•••• ${details.idNumberLast4}`
    : "not recorded";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">
        {details.idType.toUpperCase().replace("_", " ")}
      </span>
      <span className="flex items-center gap-2 text-sm">
        {revealed ?? masked}
        {revealed === null &&
        details.idNumberLast4 &&
        hasPermission("finance.view_sensitive") ? (
          <Button
            onClick={handleReveal}
            size="sm"
            type="button"
            variant="outline"
          >
            Reveal
          </Button>
        ) : null}
      </span>
    </div>
  );
}

export function DonorDetailSheet({
  canManage,
  onEdit,
  onOpenChange,
  open,
  party,
}: {
  canManage: boolean;
  onEdit: (party: PartyRow) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  party: PartyRow | null;
}) {
  const loadDetails = useServerFn(getPartyDetails);
  const [details, setDetails] = useState<Details>(null);
  const partyId = party?.id;

  useEffect(() => {
    if (!(open && partyId)) {
      return;
    }
    let cancelled = false;
    setDetails(null);
    loadDetails({ data: { partyId } })
      .then((d) => {
        if (!cancelled) {
          setDetails(d);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, partyId, loadDetails]);

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
              <IdentifierRow details={details} partyId={party.id} />
              <DetailRow
                label="Source"
                value={
                  details
                    ? details.foreignSourceAssessment === "foreign"
                      ? "Foreign source"
                      : details.foreignSourceAssessment === "pending"
                        ? "Not assessed yet"
                        : "Domestic"
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
