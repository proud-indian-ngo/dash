import {
  ArrowRight01Icon,
  Shield01Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import {
  declarationsByTrustee,
  policyVersionOn,
} from "@pi-dash/shared/declarations";
import { isHeldOn } from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import {
  epochToIso,
  formatIso,
  todayIso,
} from "@/components/governance/register-data";
import { Tag } from "@/components/shared/status-badge";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

/** Whether the signed-in account is a trustee in office today. */
function useInOffice(today: string): boolean {
  const [mine] = useQuery(queries.trustee.me());
  return mine.some((t) =>
    (t.terms ?? []).some((term) =>
      isHeldOn(
        {
          endedOn: epochToIso(term.endedOn ?? null),
          endsOn: epochToIso(term.endsOn ?? null),
          startsOn: epochToIso(term.startsOn),
        },
        today
      )
    )
  );
}

/**
 * Policy versions in force that the signed-in person hasn't acknowledged:
 * read the document, then acknowledge it here. Renders nothing otherwise.
 */
export function PoliciesToAcknowledge() {
  const zero = useZero();
  const today = todayIso();
  const inOffice = useInOffice(today);
  const [policies] = useQuery(queries.policy.all());
  const [acknowledged] = useQuery(queries.policy.myAcknowledgements());
  const [busy, setBusy] = useState<string | null>(null);
  const done = new Set(acknowledged.map((a) => a.policyVersionId));
  const items = policies
    .filter((p) => p.audience === "everyone" || inOffice)
    .flatMap((p) => {
      const version = policyVersionOn(
        (p.versions ?? []).map((v) => ({
          effectiveOn: epochToIso(v.effectiveOn),
          id: v.id,
          summary: v.summary ?? null,
          version: v.version,
        })),
        today
      );
      return version && !done.has(version.id)
        ? [{ gates: p.gatesChildren ?? false, title: p.title, version }]
        : [];
    });
  if (items.length === 0) {
    return null;
  }
  const acknowledge = async (versionId: string) => {
    setBusy(versionId);
    const result = await zero.mutate(
      mutators.policyAcknowledgement.acknowledge({
        id: uuidv7(),
        policyVersionId: versionId,
      })
    ).server;
    setBusy(null);
    handleMutationResult(result, {
      entityId: versionId,
      errorMsg: `Couldn't record it: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "policyAcknowledgement.acknowledge",
      successMsg: "Acknowledged. Thank you.",
    });
  };
  return (
    <Card aria-label="Policies to read" className="gap-0 py-0" role="region">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="text-muted-foreground size-4"
            icon={Shield01Icon}
            strokeWidth={2}
          />
          Policies to read
          <Tag className="font-mono tabular-nums">{items.length}</Tag>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {items.map((item) => (
          <div
            aria-label={item.title}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            key={item.version.id}
            role="group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {item.title} (version {item.version.version})
              </p>
              <p className="text-muted-foreground text-xs">
                {item.gates
                  ? "Needed before you join events with children. "
                  : ""}
                {item.version.summary ??
                  `In force from ${formatIso(item.version.effectiveOn)}.`}
              </p>
            </div>
            <span className="flex items-center gap-2">
              <a
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={getProtectedAttachmentHref(
                  { id: item.version.id, kind: "policyDocument" },
                  "inline"
                )}
                rel="noreferrer"
                target="_blank"
              >
                Read
              </a>
              <Button
                disabled={busy === item.version.id}
                onClick={() => acknowledge(item.version.id)}
                size="sm"
                type="button"
              >
                I've read it and will follow it
              </Button>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * A trustee in office without a declaration of interests in force for this
 * financial year, or with one waiting for their signature.
 */
export function DeclareInterests() {
  const today = todayIso();
  const inOffice = useInOffice(today);
  const [declarations, result] = useQuery(queries.conflictDeclaration.mine());
  const fiscalYear = fiscalYearLabel(today);
  const mine = declarationsByTrustee(
    declarations.filter((d) => d.fiscalYear === fiscalYear)
  )
    .values()
    .next().value;
  const awaiting = Boolean(mine?.awaiting);
  if (!inOffice || result.type !== "complete" || (mine?.inForce && !awaiting)) {
    return null;
  }
  return (
    <Card
      aria-label="Declare your interests"
      className="gap-0 py-0"
      role="region"
    >
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="text-muted-foreground size-4"
            icon={UserCheck01Icon}
            strokeWidth={2}
          />
          Declare your interests
        </CardTitle>
      </CardHeader>
      <CardContent className="hover:bg-muted/40 relative flex items-center justify-between gap-3 px-4 py-2.5 transition-colors">
        <p className="text-sm">
          {awaiting
            ? `Your declaration for ${fiscalYear} is waiting for your signature. Sign it with your DSC to make it count.`
            : `As a trustee, declare the people and organisations you're connected to for ${fiscalYear}, or that there are none (clause 5.3).`}
        </p>
        <Link
          className="text-primary flex items-center gap-1 text-xs font-medium whitespace-nowrap after:absolute after:inset-0"
          to="/governance/declarations"
        >
          {awaiting ? "Sign" : "Declare"}
          <HugeiconsIcon
            className="size-3.5"
            icon={ArrowRight01Icon}
            strokeWidth={2}
          />
        </Link>
      </CardContent>
    </Card>
  );
}
