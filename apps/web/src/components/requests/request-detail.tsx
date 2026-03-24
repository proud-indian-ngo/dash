import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useState } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { RequestHeaderMeta } from "@/components/requests/request-header-meta";
import { HistoryEntry } from "@/components/requests/request-history-entry";
import { VendorDetailsCard } from "@/components/requests/request-vendor-details";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
  getDirectAttachmentUrl,
} from "@/lib/attachment-links";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  isVendorPayment,
  REQUEST_TYPE_LABELS,
  type RequestDetailData,
} from "@/lib/request-types";
import { STATUS_BADGE_MAP } from "@/lib/status-badge";

interface RequestDetailProps {
  isAdmin: boolean;
  request: RequestDetailData;
}

export function RequestDetail({ isAdmin, request }: RequestDetailProps) {
  const zero = useZero();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const typeLabel = REQUEST_TYPE_LABELS[request.type];

  const mutatorMap = {
    reimbursement: { ns: mutators.reimbursement, name: "reimbursement" },
    vendor_payment: { ns: mutators.vendorPayment, name: "vendorPayment" },
    advance_payment: { ns: mutators.advancePayment, name: "advancePayment" },
  } as const;
  const { ns: mutatorNs, name: mutatorName } = mutatorMap[request.type];

  const { label, variant } =
    STATUS_BADGE_MAP[request.status ?? "draft"] ?? STATUS_BADGE_MAP.draft;

  const total = request.lineItems.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const handleApprove = (message: string, screenshotKey?: string) => {
    zero
      .mutate(
        mutatorNs.approve({
          id: request.id,
          note: message || undefined,
          approvalScreenshotKey: screenshotKey,
        })
      )
      .server.then(async (res) => {
        handleMutationResult(res, {
          mutation: `${mutatorName}.approve`,
          entityId: request.id,
          successMsg: `${typeLabel} approved`,
          errorMsg: `Failed to approve ${typeLabel.toLowerCase()}`,
        });
        if (res.type === "error" && screenshotKey) {
          const { deleteUploadedAsset } = await import(
            "@/functions/attachments"
          );
          deleteUploadedAsset({
            data: { key: screenshotKey, subfolder: "approval-screenshots" },
          }).catch((error) => {
            log.error({
              component: "RequestDetail",
              action: "cleanupScreenshot",
              screenshotKey,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        if (res.type !== "error") {
          setApproveOpen(false);
        }
      });
  };

  const handleReject = (reason: string) => {
    zero
      .mutate(mutatorNs.reject({ id: request.id, reason }))
      .server.then((res) => {
        handleMutationResult(res, {
          mutation: `${mutatorName}.reject`,
          entityId: request.id,
          successMsg: `${typeLabel} rejected`,
          errorMsg: `Failed to reject ${typeLabel.toLowerCase()}`,
        });
        if (res.type !== "error") {
          setRejectOpen(false);
        }
      });
  };

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-2xl">{request.title}</h1>
              <Badge variant="outline">{typeLabel}</Badge>
            </div>
            <RequestHeaderMeta request={request} />
            {request.user ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Requested by
                </span>
                <UserAvatar
                  className="size-6"
                  fallbackClassName="text-xs"
                  user={request.user}
                />
                <span className="font-medium text-sm">{request.user.name}</span>
              </div>
            ) : null}
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        {/* Vendor details */}
        <VendorDetailsCard request={request} />

        {/* Bank account details */}
        <BankAccountCard request={request} />

        {/* Admin actions */}
        {isAdmin && request.status === "pending" ? (
          <>
            <div className="flex gap-2">
              <Button
                onClick={() => setApproveOpen(true)}
                type="button"
                variant="default"
              >
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
        {request.status === "rejected" && request.rejectionReason ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
            <span className="font-medium">Rejection reason: </span>
            {request.rejectionReason}
          </div>
        ) : null}

        {/* Payment proof */}
        {request.status === "approved" && request.approvalScreenshotKey ? (
          <div className="flex flex-col gap-2">
            <h2 className="font-medium text-sm">Payment proof</h2>
            <div className="flex flex-col items-start gap-1.5">
              <a
                href={getDirectAttachmentUrl(request.approvalScreenshotKey)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <img
                  alt="Payment proof"
                  className="h-24 w-24 rounded-md border object-cover"
                  height={96}
                  src={getDirectAttachmentUrl(request.approvalScreenshotKey)}
                  width={96}
                />
              </a>
              <a
                className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                download
                href={getAttachmentDownloadHref({
                  type: "file",
                  objectKey: request.approvalScreenshotKey,
                  filename: "payment-proof",
                  mimeType: "image/jpeg",
                  url: null,
                })}
                rel="noopener noreferrer"
                target="_blank"
              >
                Download
              </a>
            </div>
          </div>
        ) : null}

        {/* Line items */}
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">Line items</h2>
          {request.lineItems.length > 0 ? (
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
                  {request.lineItems.map((item) => (
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
        {request.attachments.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-medium text-sm">Attachments</h2>
            <div className="flex flex-col gap-1.5">
              {request.attachments.map((att) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2"
                  key={att.id}
                >
                  <span className="min-w-0 truncate text-sm">
                    {getAttachmentLabel(att)}
                  </span>
                  <div className="flex items-center gap-3">
                    {att.type === "url" ? (
                      <a
                        className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                        href={getAttachmentPreviewHref(att)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        View link
                        <span className="sr-only">
                          {getAttachmentLabel(att)} (opens in new tab)
                        </span>
                      </a>
                    ) : (
                      <>
                        <a
                          className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                          href={getAttachmentPreviewHref(att)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Preview
                          <span className="sr-only">
                            {getAttachmentLabel(att)} (opens in new tab)
                          </span>
                        </a>
                        <a
                          className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                          download
                          href={getAttachmentDownloadHref(att)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Download
                          <span className="sr-only">
                            {getAttachmentLabel(att)} (opens in new tab)
                          </span>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* History */}
        {request.history.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">History</h2>
              <div className="flex flex-col">
                {request.history.map((entry) => (
                  <HistoryEntry entry={entry} key={entry.id} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        <ApproveDialog
          entityId={request.id}
          entityLabel={typeLabel.toLowerCase()}
          onConfirm={handleApprove}
          onOpenChange={setApproveOpen}
          open={approveOpen}
        />
        <RejectDialog
          entityLabel={typeLabel.toLowerCase()}
          onConfirm={handleReject}
          onOpenChange={setRejectOpen}
          open={rejectOpen}
        />
      </div>
    </AppErrorBoundary>
  );
}

function getBankDetails(request: RequestDetailData) {
  if (isVendorPayment(request)) {
    if (!request.vendor) {
      return null;
    }
    return {
      name: request.vendor.bankAccountName?.trim() || null,
      number: request.vendor.bankAccountNumber?.trim() || null,
      ifsc: request.vendor.bankAccountIfscCode?.trim() || null,
    };
  }
  return {
    name: request.bankAccountName?.trim() || null,
    number: request.bankAccountNumber?.trim() || null,
    ifsc: request.bankAccountIfscCode?.trim() || null,
  };
}

function BankAccountCard({ request }: { request: RequestDetailData }) {
  const bank = getBankDetails(request);

  if (!(bank && (bank.name || bank.number || bank.ifsc))) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h2 className="font-medium text-sm">Bank account details</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        {bank.name ? (
          <div>
            <p className="text-muted-foreground text-xs">Account name</p>
            <p className="text-sm">{bank.name}</p>
          </div>
        ) : null}
        {bank.number ? (
          <div>
            <p className="text-muted-foreground text-xs">Account number</p>
            <p className="font-mono text-sm">{bank.number}</p>
          </div>
        ) : null}
        {bank.ifsc ? (
          <div>
            <p className="text-muted-foreground text-xs">IFSC code</p>
            <p className="font-mono text-sm">{bank.ifsc}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
