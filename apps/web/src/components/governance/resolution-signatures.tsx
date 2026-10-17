import { Progress } from "@pi-dash/design-system/components/ui/progress";
import {
  SIGNATURE_METHOD_LABELS,
  type SignatureMethod,
} from "@pi-dash/shared/resolutions";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { formatTimestamp } from "@/lib/date-formats";

interface SignatureResponse {
  conflictDeclared: boolean | null;
  conflictNote: string | null;
  id: string;
  reason: string | null;
  response: string | null;
  signature?: {
    method: SignatureMethod;
    signerName: string | null;
    signingTime: number | null;
  } | null;
  trustee?: { legalName: string } | null;
  userId: string | null;
}

function responseState(r: SignatureResponse): {
  label: string;
  tone: StatusTone;
} {
  if (r.conflictDeclared) {
    return { label: "Conflict declared", tone: "warning" };
  }
  if (r.response === "assent") {
    return { label: "Signed", tone: "success" };
  }
  if (r.response === "objection") {
    return { label: "Objected", tone: "danger" };
  }
  return { label: "Waiting", tone: "neutral" };
}

/** Each trustee's response and the count toward the pass threshold. */
export function ResolutionSignatures({
  assents,
  needed,
  objections,
  responses,
  thresholdLabel,
  userId,
}: {
  assents: number;
  needed: number;
  objections: number;
  responses: SignatureResponse[];
  thresholdLabel: string;
  userId: string;
}) {
  return (
    <section
      aria-labelledby="signatures-heading"
      className="flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold" id="signatures-heading">
          Signatures
        </h2>
        <span className="text-sm tabular-nums">
          {assents} of {needed} signatures
        </span>
      </div>
      <Progress
        aria-label="Signatures toward the threshold"
        value={needed > 0 ? Math.min(100, (assents / needed) * 100) : 0}
      />
      <p className="text-muted-foreground text-xs">
        {thresholdLabel}
        {objections > 0 ? ` · ${objections} objected` : ""}
      </p>
      <ul className="flex flex-col divide-y">
        {responses.map((r) => {
          const { label, tone } = responseState(r);
          const detail = r.signature
            ? [
                SIGNATURE_METHOD_LABELS[r.signature.method],
                r.signature.signerName,
                r.signature.signingTime
                  ? formatTimestamp(
                      new Date(r.signature.signingTime).toISOString()
                    )
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : (r.reason ?? r.conflictNote);
          return (
            <li className="flex flex-col gap-1 py-2.5" key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {r.trustee?.legalName}
                  {r.userId === userId ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (you)
                    </span>
                  ) : null}
                </span>
                <StatusBadge tone={tone}>{label}</StatusBadge>
              </div>
              {detail ? (
                <p className="text-muted-foreground text-xs text-pretty">
                  {detail}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
