import { Button } from "@pi-dash/design-system/components/ui/button";
import { epochDayToIso, todayInKolkata } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import {
  certificateStatusLabel,
  defaultCertificatePeriod,
} from "@pi-dash/shared/utilisation-certificates";
import { queries } from "@pi-dash/zero/queries";
import type { UtilisationCertificate } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { RecordSection } from "@/components/shared/record-detail";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { getUtilisationCertificateDrift } from "@/functions/utilisation-certificates";
import { DATE } from "@/lib/date-formats";

import { PrepareCertificateDialog } from "./prepare-certificate-dialog";

const day = (iso: string) => format(parseISO(iso), DATE);

export function certificateTone(status: string): StatusTone {
  switch (status) {
    case "final":
      return "success";
    case "cancelled":
    case "discarded":
      return "neutral";
    default:
      return "warning";
  }
}

/**
 * What changed since each live certificate was prepared, from the server
 * (the books aren't in the browser). Loaded once per change of the list.
 */
function useDrift(grantId: string, listKey: string) {
  const load = useServerFn(getUtilisationCertificateDrift);
  const [drift, setDrift] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    load({ data: { grantId } })
      .then((rows) => {
        if (!cancelled) {
          setDrift(new Map(rows.map((r) => [r.id, r.changes])));
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "utilisationCertificate.drift",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "UtilisationCertificatesSection",
          grantId,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [grantId, listKey, load]);
  return drift;
}

/** Whether a drifted certificate has a signature yet. */
const signed = (c: UtilisationCertificate) =>
  c.status !== "awaiting_head" && c.status !== "discarded";

/** The grant page's certificates: each with its period, closing balance and whose turn it is. */
export function UtilisationCertificatesSection({
  canManage,
  grant,
}: {
  canManage: boolean;
  grant: { endsOn: number; id: string; startsOn: number };
}) {
  const [certificates] = useQuery(
    queries.utilisationCertificate.byGrant({ grantId: grant.id })
  );
  const [preparing, setPreparing] = useState(false);
  const drift = useDrift(
    grant.id,
    certificates.map((c) => `${c.id}:${c.status}`).join(",")
  );
  const defaults = {
    ...defaultCertificatePeriod(
      {
        endsOn: epochDayToIso(grant.endsOn),
        startsOn: epochDayToIso(grant.startsOn),
      },
      certificates.map((c) => ({
        status: c.status,
        toOn: epochDayToIso(c.toOn),
      })),
      todayInKolkata()
    ),
    place: certificates[0]?.snapshot.place ?? "",
  };

  return (
    <RecordSection
      action={
        canManage ? (
          <Button
            onClick={() => setPreparing(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Prepare certificate
          </Button>
        ) : null
      }
      title="Utilisation certificates"
    >
      {certificates.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
          No certificates yet. Prepare one for any period of the grant.
        </p>
      ) : (
        <ul
          className="divide-y rounded-lg border"
          data-testid="utilisation-certificates"
        >
          {certificates.map((c) => {
            const changes = drift.get(c.id);
            return (
              <li
                className="hover:bg-muted/40 relative flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm"
                key={c.id}
              >
                <span className="flex min-w-0 flex-col">
                  <Link
                    className="font-mono font-medium after:absolute after:inset-0"
                    params={{ certificateId: c.id }}
                    to="/finance/grants/certificates/$certificateId"
                  >
                    {c.number}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {`${day(epochDayToIso(c.fromOn))} to ${day(epochDayToIso(c.toOn))}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {changes ? (
                    <StatusBadge tone="danger">
                      {signed(c)
                        ? "Figures changed since signing"
                        : "Figures changed since preparing"}
                    </StatusBadge>
                  ) : null}
                  <StatusBadge tone={certificateTone(c.status)}>
                    {certificateStatusLabel(c.status, c.snapshot.signatories)}
                  </StatusBadge>
                  <span className="font-mono tabular-nums">
                    {formatPaise(c.snapshot.figures.closingPaise)}
                  </span>
                </span>
                {changes ? (
                  <ul className="text-muted-foreground basis-full text-xs">
                    {changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <PrepareCertificateDialog
        defaults={defaults}
        grantId={grant.id}
        onOpenChange={setPreparing}
        open={preparing}
      />
    </RecordSection>
  );
}
