import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Edit02Icon,
  FileDownloadIcon,
  RepeatIcon,
  TickDouble02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise, qualifiesForCashVoucher } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ChargedToCard } from "@/components/expenses/charged-to-card";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { reimbursementHeaderMeta } from "@/components/reimbursements/reimbursement-header-meta";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import {
  AttachmentList,
  DetailsCard,
  DetailsRow,
  HistoryCard,
  RecordDetailLayout,
  RecordSection,
  RejectionNote,
} from "@/components/shared/record-detail";
import { RequesterMeta } from "@/components/shared/requester-meta";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import {
  getAttachmentDownloadHref,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestDetailData,
} from "@/lib/reimbursement-types";
import { requestChargeSummary } from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";
import { getStatusBadge } from "@/lib/status-badge";

interface ReimbursementDetailProps {
  canApprove: boolean;
  canUpdateAnyStatus?: boolean;
  /** Opens the edit form; omitted when the viewer can't edit. */
  onEdit?: () => void;
  request: RequestDetailData;
}

const REQUEST_ASSET_KINDS = {
  advance_payment: {
    approvalScreenshotKind: "advancePaymentApprovalScreenshot",
    attachmentKind: "advancePaymentAttachment",
  },
  reimbursement: {
    approvalScreenshotKind: "reimbursementApprovalScreenshot",
    attachmentKind: "reimbursementAttachment",
  },
} as const;

const toApprovalScreenshot = (objectKey: null | string | undefined) =>
  objectKey
    ? {
        filename: "payment-proof",
        mimeType: "image/jpeg",
        objectKey,
        type: "file" as const,
        url: null,
      }
    : null;

export function ReimbursementDetail({
  canApprove,
  canUpdateAnyStatus = false,
  onEdit,
  request,
}: ReimbursementDetailProps) {
  const zero = useZero();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [generatingVoucherId, setGeneratingVoucherId] = useState<string | null>(
    null
  );

  const typeLabel = REQUEST_TYPE_LABELS[request.type];

  const mutatorMap = {
    advance_payment: { name: "advancePayment", ns: mutators.advancePayment },
    reimbursement: { name: "reimbursement", ns: mutators.reimbursement },
  } as const;
  const { ns: mutatorNs, name: mutatorName } = mutatorMap[request.type];

  const { label, tone } = getStatusBadge(request.status);
  const showAdminActions =
    canApprove && (request.status === "pending" || canUpdateAnyStatus);
  const showApproveAction = showAdminActions && request.status !== "approved";
  const showRejectAction = showAdminActions && request.status !== "rejected";
  const showResetAction = showAdminActions && request.status !== "pending";

  const total = sumAmounts(request.lineItems);
  const { approvalScreenshotKind, attachmentKind } =
    REQUEST_ASSET_KINDS[request.type];
  const approvalScreenshot = toApprovalScreenshot(
    request.approvalScreenshotKey
  );
  const approvalScreenshotRef = {
    id: request.id,
    kind: approvalScreenshotKind,
  } as const;

  const handleApprove = useEventCallback(
    async (message: string, screenshotKey?: string) => {
      const res = await zero.mutate(
        mutatorNs.approve({
          approvalScreenshotKey: screenshotKey,
          id: request.id,
          note: message || undefined,
        })
      ).server;
      handleMutationResult(res, {
        entityId: request.id,
        errorMsg: `Couldn't approve ${typeLabel.toLowerCase()}`,
        mutation: `${mutatorName}.approve`,
        successMsg: `${typeLabel} approved`,
      });
      return res.type !== "error";
    }
  );

  const handleGenerateVoucher = useEventCallback(async (lineItemId: string) => {
    if (request.type !== "reimbursement" || generatingVoucherId) {
      return;
    }
    setGeneratingVoucherId(lineItemId);
    try {
      const res = await zero.mutate(
        mutators.reimbursement.generateVoucher({
          lineItemId,
          reimbursementId: request.id,
        })
      ).server;
      handleMutationResult(res, {
        entityId: lineItemId,
        errorMsg: "Couldn't generate voucher",
        mutation: "reimbursement.generateVoucher",
        successMsg: "Voucher generation started",
      });
    } finally {
      setGeneratingVoucherId(null);
    }
  });

  const handleReject = useEventCallback(async (reason: string) => {
    const res = await zero.mutate(mutatorNs.reject({ id: request.id, reason }))
      .server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: `Couldn't reject ${typeLabel.toLowerCase()}`,
      mutation: `${mutatorName}.reject`,
      successMsg: `${typeLabel} rejected`,
    });
    if (res.type !== "error") {
      setRejectOpen(false);
    }
  });

  const handleResetToPending = useEventCallback(async () => {
    const res = await zero.mutate(mutatorNs.resetToPending({ id: request.id }))
      .server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: `Couldn't reset ${typeLabel.toLowerCase()} to pending`,
      mutation: `${mutatorName}.resetToPending`,
      successMsg: `${typeLabel} reset to pending`,
    });
  });
  const stableOnClick0 = useEventCallback(() => setApproveOpen(true));
  const stableOnClick1 = useEventCallback(() => setRejectOpen(true));

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <PageHeader
          actions={
            <>
              {showApproveAction ? (
                <Button
                  onClick={stableOnClick0}
                  type="button"
                  variant={request.status === "pending" ? "default" : "outline"}
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={CheckmarkCircle01Icon}
                    strokeWidth={2}
                  />
                  Approve
                </Button>
              ) : null}
              {showRejectAction ? (
                <Button
                  onClick={stableOnClick1}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Cancel01Icon}
                    strokeWidth={2}
                  />
                  Reject
                </Button>
              ) : null}
              {onEdit ? (
                <Button onClick={onEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  showResetAction && {
                    id: "reset",
                    icon: RepeatIcon,
                    label: "Reset to pending",
                    onSelect: handleResetToPending,
                  },
                ]}
                title={request.title}
              />
            </>
          }
          badge={
            <>
              <Tag>{typeLabel}</Tag>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </>
          }
          meta={[
            request.user ? (
              <RequesterMeta key="requester" user={request.user} />
            ) : null,
            ...reimbursementHeaderMeta(request),
          ]}
          title={request.title}
        />

        <RecordDetailLayout
          aside={
            <>
              {isReimbursement(request) ? (
                <ChargedToCard kind="reimbursement" request={request} />
              ) : null}
              <BankAccountCard request={request} />
              <HistoryCard entries={request.history} />
            </>
          }
        >
          {request.status === "rejected" && request.rejectionReason ? (
            <RejectionNote reason={request.rejectionReason} />
          ) : null}

          <LineItemsTable
            canApprove={canApprove}
            generatingVoucherId={generatingVoucherId}
            onGenerateVoucher={handleGenerateVoucher}
            request={request}
            total={total}
          />

          {request.status === "approved" && approvalScreenshot ? (
            <RecordSection title="Payment proof">
              <div className="flex items-center gap-3 rounded-lg border p-2">
                <a
                  href={getAttachmentPreviewHref(
                    approvalScreenshot,
                    approvalScreenshotRef
                  )}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <img
                    alt="Payment proof"
                    className="bg-muted size-14 rounded-md border object-cover"
                    height={56}
                    src={getAttachmentPreviewHref(
                      approvalScreenshot,
                      approvalScreenshotRef
                    )}
                    width={56}
                  />
                </a>
                <span className="min-w-0 flex-1 text-sm">
                  Screenshot added when this was approved
                </span>
                <a
                  className="text-primary px-1 text-xs font-medium underline-offset-2 hover:underline"
                  download
                  href={getAttachmentDownloadHref(
                    approvalScreenshot,
                    approvalScreenshotRef
                  )}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Download
                </a>
              </div>
            </RecordSection>
          ) : null}

          {request.attachments.length > 0 ? (
            <RecordSection title="Attachments">
              <AttachmentList
                attachments={request.attachments}
                kind={attachmentKind}
              />
            </RecordSection>
          ) : null}
        </RecordDetailLayout>

        <ApproveDialog
          entityId={request.id}
          entityLabel={typeLabel.toLowerCase()}
          hasExistingScreenshot={Boolean(request.approvalScreenshotKey)}
          onConfirm={handleApprove}
          onOpenChange={setApproveOpen}
          open={approveOpen}
          summary={
            isReimbursement(request) ? (
              <>Charged to: {requestChargeSummary(request)}</>
            ) : undefined
          }
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

function VoucherCell({
  canApprove,
  isApproved,
  isGenerating,
  item,
  onGenerate,
}: {
  canApprove: boolean;
  isApproved: boolean;
  isGenerating: boolean;
  item: {
    amountPaise: number;
    generateVoucher?: boolean | null;
    id: string;
    voucherAttachmentId?: string | null;
  };
  onGenerate: (lineItemId: string) => void;
}) {
  const { amountPaise } = item;
  const hasVoucher = !!item.voucherAttachmentId;
  const isQualifying = qualifiesForCashVoucher(amountPaise);
  const handleGenerate = useEventCallback(() => onGenerate(item.id));

  if (hasVoucher) {
    return (
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon
          className="text-success-foreground size-3.5"
          icon={TickDouble02Icon}
          strokeWidth={2}
        />
        <span className="text-success-foreground text-xs">Generated</span>
        {canApprove && isApproved ? (
          <Button
            className="ml-1 h-auto px-1.5 py-0.5 text-xs"
            disabled={isGenerating}
            onClick={handleGenerate}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-3"
              icon={RepeatIcon}
              strokeWidth={2}
            />
            {isGenerating ? "Regenerating..." : "Regenerate"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (item.generateVoucher && isApproved && !hasVoucher) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Pending...</span>
        {canApprove ? (
          <Button
            className="ml-1 h-auto px-1.5 py-0.5 text-xs"
            disabled={isGenerating}
            onClick={handleGenerate}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isGenerating ? "Generating..." : "Retry"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (canApprove && isApproved && isQualifying) {
    return (
      <Button
        className="h-auto px-2 py-1 text-xs"
        disabled={isGenerating}
        onClick={handleGenerate}
        size="sm"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          className="size-3.5"
          icon={FileDownloadIcon}
          strokeWidth={2}
        />
        {isGenerating ? "Generating..." : "Generate voucher"}
      </Button>
    );
  }

  return <span className="text-muted-foreground text-xs">—</span>;
}

function LineItemsTable({
  canApprove,
  generatingVoucherId,
  onGenerateVoucher,
  request,
  total,
}: {
  canApprove: boolean;
  generatingVoucherId: string | null;
  onGenerateVoucher: (lineItemId: string) => void;
  request: RequestDetailData;
  total: number;
}) {
  const isReimb = isReimbursement(request);
  const showVoucherCol = isReimb && request.status === "approved";

  return (
    <RecordSection title="Line items">
      {request.lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground border-b text-xs">
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                {showVoucherCol ? (
                  <th className="px-3 py-2 text-left font-medium">Voucher</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {request.lineItems.map((item) => (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="px-3 py-2">{item.category?.name}</td>
                  <td className="text-muted-foreground px-3 py-2">
                    {item.description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPaise(item.amountPaise)}
                  </td>
                  {showVoucherCol ? (
                    <td className="px-3 py-2">
                      <VoucherCell
                        canApprove={canApprove}
                        isApproved={request.status === "approved"}
                        isGenerating={generatingVoucherId === item.id}
                        item={item}
                        onGenerate={onGenerateVoucher}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 border-t">
                <td
                  className="px-3 py-2 font-medium"
                  colSpan={showVoucherCol ? 2 : 2}
                >
                  Total
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatPaise(total)}
                </td>
                {showVoucherCol ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          No line items.
        </p>
      )}
    </RecordSection>
  );
}

function getBankDetails(request: RequestDetailData) {
  return {
    ifsc: request.bankAccountIfscCode?.trim() || null,
    name: request.bankAccountName?.trim() || null,
    number: request.bankAccountNumber?.trim() || null,
  };
}

function BankAccountCard({ request }: { request: RequestDetailData }) {
  const bank = getBankDetails(request);

  if (!(bank.name || bank.number || bank.ifsc)) {
    return null;
  }

  return (
    <DetailsCard title="Paid to">
      {bank.name ? (
        <DetailsRow label="Account name">{bank.name}</DetailsRow>
      ) : null}
      {bank.number ? (
        <DetailsRow label="Account number">
          <span className="font-mono">{bank.number}</span>
        </DetailsRow>
      ) : null}
      {bank.ifsc ? (
        <DetailsRow label="IFSC code">
          <span className="font-mono">{bank.ifsc}</span>
        </DetailsRow>
      ) : null}
    </DetailsCard>
  );
}
