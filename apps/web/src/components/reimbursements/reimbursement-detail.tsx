import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type {
  ExpenseCategory,
  Reimbursement,
  ReimbursementAttachment,
  ReimbursementHistory,
  ReimbursementLineItem,
  User,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { RejectDialog } from "@/components/form/reject-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { formatINR } from "@/lib/form-schemas";
import { STATUS_BADGE_MAP } from "@/lib/status-badge";

export type ReimbursementDetailData = Reimbursement & {
  lineItems: ReadonlyArray<
    ReimbursementLineItem & { category: ExpenseCategory | undefined }
  >;
  attachments: readonly ReimbursementAttachment[];
  history: ReadonlyArray<ReimbursementHistory & { actor?: User | undefined }>;
  user: User | undefined;
};

interface ReimbursementDetailProps {
  isAdmin: boolean;
  reimbursement: ReimbursementDetailData;
}

function HistoryEntry({
  entry,
}: {
  entry: ReimbursementDetailData["history"][number];
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex flex-col items-center">
        <div className="size-2 rounded-full bg-border" />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-0.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm capitalize">{entry.action}</span>
          <span className="text-muted-foreground text-xs">
            {format(entry.createdAt, "dd/MM/yyyy, HH:mm")}
          </span>
        </div>
        {entry.note ? (
          <span className="text-muted-foreground text-sm italic">
            {entry.note}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ReimbursementDetail({
  isAdmin,
  reimbursement,
}: ReimbursementDetailProps) {
  const zero = useZero();
  const [rejectOpen, setRejectOpen] = useState(false);

  const { label, variant } =
    STATUS_BADGE_MAP[reimbursement.status ?? "draft"] ?? STATUS_BADGE_MAP.draft;

  const total = reimbursement.lineItems.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const handleApprove = () => {
    zero
      .mutate(mutators.reimbursement.approve({ id: reimbursement.id }))
      .server.then((res) => {
        if (res.type === "error") {
          toast.error("Failed to approve reimbursement");
        } else {
          toast.success("Reimbursement approved");
        }
      });
  };

  const handleReject = (reason: string) => {
    zero
      .mutate(mutators.reimbursement.reject({ id: reimbursement.id, reason }))
      .server.then((res) => {
        if (res.type === "error") {
          toast.error("Failed to reject reimbursement");
        } else {
          toast.success("Reimbursement rejected");
          setRejectOpen(false);
        }
      });
  };

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-2xl">{reimbursement.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
              {reimbursement.city ? <span>{reimbursement.city}</span> : null}
              <span>
                {format(new Date(reimbursement.expenseDate), "MMMM d, yyyy")}
              </span>
              {reimbursement.bankAccountName &&
              reimbursement.bankAccountNumber ? (
                <span>
                  {reimbursement.bankAccountName} ( ••••
                  {reimbursement.bankAccountNumber.slice(-4)})
                </span>
              ) : null}
            </div>
            {reimbursement.user ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Requested by
                </span>
                <UserAvatar
                  className="size-6"
                  fallbackClassName="text-xs"
                  user={reimbursement.user}
                />
                <span className="font-medium text-sm">
                  {reimbursement.user.name}
                </span>
              </div>
            ) : null}
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        {/* Admin actions */}
        {isAdmin && reimbursement.status === "pending" ? (
          <>
            <div className="flex gap-2">
              <Button onClick={handleApprove} type="button" variant="default">
                <HugeiconsIcon
                  className="size-4"
                  icon={CheckmarkCircle01Icon}
                  strokeWidth={2}
                />
                Approve
              </Button>
              <Button
                onClick={() => setRejectOpen(true)}
                type="button"
                variant="destructive"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Cancel01Icon}
                  strokeWidth={2}
                />
                Reject
              </Button>
            </div>
            <Separator />
          </>
        ) : null}

        {/* Rejection reason */}
        {reimbursement.status === "rejected" &&
        reimbursement.rejectionReason ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
            <span className="font-medium">Rejection reason: </span>
            {reimbursement.rejectionReason}
          </div>
        ) : null}

        {/* Line items */}
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">Line items</h2>
          {reimbursement.lineItems.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursement.lineItems.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="px-3 py-2">
                        {item.category?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {item.description ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(Number(item.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50">
                    <td className="px-3 py-2 font-medium" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatINR(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              No line items.
            </p>
          )}
        </div>

        {/* Attachments */}
        {reimbursement.attachments.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-medium text-sm">Attachments</h2>
            <div className="flex flex-col gap-1.5">
              {reimbursement.attachments.map((att) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  key={att.id}
                >
                  <span className="truncate text-sm">
                    {getAttachmentLabel(att)}
                  </span>
                  <div className="flex items-center gap-3">
                    <a
                      className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                      href={getAttachmentPreviewHref(att)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Preview
                    </a>
                    <a
                      className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                      download={att.type === "file"}
                      href={getAttachmentDownloadHref(att)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* History */}
        {reimbursement.history.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">History</h2>
              <div className="flex flex-col">
                {reimbursement.history.map((entry) => (
                  <HistoryEntry entry={entry} key={entry.id} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        <RejectDialog
          entityLabel="reimbursement"
          onConfirm={handleReject}
          onOpenChange={setRejectOpen}
          open={rejectOpen}
        />
      </div>
    </AppErrorBoundary>
  );
}
