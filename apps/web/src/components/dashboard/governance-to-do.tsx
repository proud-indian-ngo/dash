import { ArrowRight01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import { declarationsByTrustee } from "@pi-dash/shared/declarations";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";

import { useInOffice } from "@/components/governance/policy-gate";
import { todayIso } from "@/components/governance/register-data";

/**
 * A trustee in office without a declaration of interests in force for this
 * financial year, or with one waiting for their signature.
 */
export function DeclareInterests() {
  const today = todayIso();
  const { inOffice } = useInOffice(today);
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
