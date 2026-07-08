import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { formatINR } from "@/lib/form-schemas";
import { getStatusBadge } from "@/lib/status-badge";

function sumLineItems(lineItems: readonly { amount: number }[]): number {
  return lineItems.reduce((sum, item) => sum + item.amount, 0);
}

interface ExpenseRowProps {
  status: string | null;
  submitter: string | null | undefined;
  title: string;
  total: number;
}

function ExpenseRow({ title, submitter, total, status }: ExpenseRowProps) {
  const { label, variant } = getStatusBadge(status);
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{title}</p>
        {submitter ? (
          <p className="truncate text-muted-foreground text-xs">{submitter}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums">{formatINR(total)}</span>
        <Badge size="sm" variant={variant}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

function SectionHeader({ title, total }: { title: string; total: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </p>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatINR(total)}
      </span>
    </div>
  );
}

interface EventExpensesProps {
  eventId: string;
}

export function EventExpenses({ eventId }: EventExpensesProps) {
  const [reimbursements, reimbResult] = useQuery(
    queries.reimbursement.byEvent({ eventId })
  );
  const [vendorPayments, vpResult] = useQuery(
    queries.vendorPayment.byEvent({ eventId })
  );

  const isLoading =
    reimbResult.type !== "complete" || vpResult.type !== "complete";

  const reimbList = reimbursements ?? [];
  const vpList = vendorPayments ?? [];

  const reimbTotal = reimbList.reduce(
    (sum, r) => sum + sumLineItems(r.lineItems),
    0
  );
  const vpTotal = vpList.reduce(
    (sum, vp) => sum + sumLineItems(vp.lineItems),
    0
  );
  const grandTotal = reimbTotal + vpTotal;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (reimbList.length === 0 && vpList.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        No expenses linked to this event yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {reimbList.length > 0 ? (
        <div>
          <SectionHeader title="Reimbursements" total={reimbTotal} />
          <div className="divide-y">
            {reimbList.map((r) => (
              <ExpenseRow
                key={r.id}
                status={r.status}
                submitter={r.user?.name}
                title={r.title}
                total={sumLineItems(r.lineItems)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {vpList.length > 0 ? (
        <div>
          <SectionHeader title="Vendor Payments" total={vpTotal} />
          <div className="divide-y">
            {vpList.map((vp) => (
              <ExpenseRow
                key={vp.id}
                status={vp.status}
                submitter={vp.vendor?.name ?? vp.user?.name}
                title={vp.title}
                total={sumLineItems(vp.lineItems)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {reimbList.length > 0 && vpList.length > 0 ? (
        <div className="flex items-center justify-between border-t pt-2">
          <p className="font-semibold text-sm">Total</p>
          <p className="font-semibold text-sm tabular-nums">
            {formatINR(grandTotal)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
