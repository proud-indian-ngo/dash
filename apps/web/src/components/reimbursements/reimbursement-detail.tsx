import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Edit02Icon,
  FileDownloadIcon,
  ImageUploadIcon,
  RepeatIcon,
  TickDouble02Icon,
  UnavailableIcon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  formatCashVoucherLimit,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import { requestCostCentreId } from "@pi-dash/shared/cost-centre";
import { formatPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ChargedToCard } from "@/components/expenses/charged-to-card";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { VoidDialog } from "@/components/form/void-dialog";
import { PaidFromBank } from "@/components/income/bank/in-bank-fact";
import { ChangeClaimantDialog } from "@/components/reimbursements/change-claimant-dialog";
import {
  canCollectPayeeSignature,
  PayeeSignatureLine,
} from "@/components/reimbursements/payee-signature";
import { PaymentProofDialog } from "@/components/reimbursements/payment-proof-dialog";
import { reimbursementHeaderMeta } from "@/components/reimbursements/reimbursement-header-meta";
import { VoucherSignedCopy } from "@/components/reimbursements/voucher-signed-copy";
import { contactActions } from "@/components/shared/contact-actions";
import { FilePreviewButton } from "@/components/shared/file-preview";
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
  isVoided,
  useIsPostedInBooks,
  VoidBadge,
} from "@/components/shared/void";
import { useApp } from "@/context/app-context";
import { useCashVoucherLimit } from "@/hooks/use-cash-voucher-limit";
import { useCostCentres } from "@/hooks/use-cost-centres";
import { useUserContact } from "@/hooks/use-user-contact";
import {
  getAttachmentDownloadHref,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import {
  isReimbursement,
  type ReimbursementDetailData,
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
  /** Called when the payment proof dialog closes (clears its deep link). */
  onPaymentProofClose?: () => void;
  /** Opens "Add payment proof" on arrival, from the Books waiting list. */
  openPaymentProof?: boolean;
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
  onPaymentProofClose,
  openPaymentProof = false,
  request,
}: ReimbursementDetailProps) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const costCentres = useCostCentres();
  const requesterContact = useUserContact(request.user?.id);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [changeClaimantOpen, setChangeClaimantOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);
  // A voided request takes no further change (finance Option B).
  const voided = isVoided(request);
  const posted = useIsPostedInBooks("reimbursement", request.id);
  // Finance voids a reimbursement the books hold instead of deleting it.
  const showVoid =
    request.type === "reimbursement" &&
    posted &&
    !voided &&
    hasPermission("requests.void");
  // Finance moves a reimbursement to the right claimant at any status.
  const showChangeClaimant =
    request.type === "reimbursement" &&
    !voided &&
    hasPermission("requests.create_for_others");
  const [generatingVoucherId, setGeneratingVoucherId] = useState<string | null>(
    null
  );
  // An approved claim takes its payment screenshot after approval too: the
  // books post it only with one (finance layer 3-3a).
  const hasPaymentProof = Boolean(request.approvalScreenshotKey);
  const showPaymentProof =
    request.type === "reimbursement" &&
    request.status === "approved" &&
    !voided &&
    hasPermission("requests.approve");
  const [paymentProofOpen, setPaymentProofOpen] = useState(
    openPaymentProof && showPaymentProof
  );

  const typeLabel = REQUEST_TYPE_LABELS[request.type];

  const mutatorMap = {
    advance_payment: { name: "advancePayment", ns: mutators.advancePayment },
    reimbursement: { name: "reimbursement", ns: mutators.reimbursement },
  } as const;
  const { ns: mutatorNs, name: mutatorName } = mutatorMap[request.type];

  const { label, tone } = getStatusBadge(request.status);
  const showAdminActions =
    !voided &&
    canApprove &&
    (request.status === "pending" || canUpdateAnyStatus);
  const editAction = voided ? undefined : onEdit;
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
    await zero
      .mutate(
        mutators.reimbursement.generateVoucher({
          lineItemId,
          reimbursementId: request.id,
        })
      )
      .server.then((res) =>
        handleMutationResult(res, {
          entityId: lineItemId,
          errorMsg: "Couldn't generate voucher",
          mutation: "reimbursement.generateVoucher",
          successMsg: "Voucher generation started",
        })
      )
      .finally(() => setGeneratingVoucherId(null));
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
  const handleChangeClaimant = useEventCallback(() =>
    setChangeClaimantOpen(true)
  );
  const handleOpenVoid = useEventCallback(() => setVoidOpen(true));
  const handleOpenPaymentProof = useEventCallback(() =>
    setPaymentProofOpen(true)
  );
  const handlePaymentProofOpenChange = useEventCallback((isOpen: boolean) => {
    setPaymentProofOpen(isOpen);
    if (!isOpen) {
      onPaymentProofClose?.();
    }
  });
  const handleVoid = useEventCallback(async (reason: string) => {
    setVoidLoading(true);
    await zero
      .mutate(mutators.reimbursement.void({ id: request.id, reason }))
      .server.then((res) => {
        handleMutationResult(res, {
          entityId: request.id,
          errorMsg: getMutationResultErrorMessage(
            res.type === "error" ? res.error : undefined,
            "Couldn't void the reimbursement"
          ),
          mutation: "reimbursement.void",
          successMsg: "Reimbursement voided",
        });
        if (res.type !== "error") {
          setVoidOpen(false);
        }
      })
      .finally(() => setVoidLoading(false));
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
              {editAction ? (
                <Button onClick={editAction} type="button" variant="outline">
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
                  ...contactActions(requesterContact, "requester"),
                  showPaymentProof && {
                    id: "payment-proof",
                    icon: ImageUploadIcon,
                    label: hasPaymentProof
                      ? "Replace payment proof"
                      : "Add payment proof",
                    onSelect: handleOpenPaymentProof,
                  },
                  showChangeClaimant && {
                    id: "change-claimant",
                    icon: UserSwitchIcon,
                    label: "Change claimant",
                    onSelect: handleChangeClaimant,
                  },
                  showResetAction && {
                    id: "reset",
                    icon: RepeatIcon,
                    label: "Reset to pending",
                    onSelect: handleResetToPending,
                  },
                  showVoid && {
                    destructive: true,
                    id: "void",
                    icon: UnavailableIcon,
                    label: "Void",
                    onSelect: handleOpenVoid,
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
              {voided ? <VoidBadge /> : null}
            </>
          }
          meta={[
            request.user ? (
              <RequesterMeta key="requester" user={request.user} />
            ) : null,
            raisedByOther(request) ? (
              <span key="raised-by">Raised by {raisedByOther(request)}</span>
            ) : null,
            ...reimbursementHeaderMeta(
              request,
              costCentres.nameOf(requestCostCentreId(request))
            ),
          ]}
          title={request.title}
        />

        <RecordDetailLayout
          aside={
            <>
              {isReimbursement(request) ? (
                <ChargedToCard kind="reimbursement" request={request} />
              ) : null}
              {isReimbursement(request) &&
              request.status === "approved" &&
              !voided &&
              (hasPermission("finance.view") ||
                hasPermission("finance.manage")) ? (
                <DetailsCard title="In the bank">
                  <PaidFromBank
                    amountPaise={total}
                    documentId={request.id}
                    kind="reimbursement"
                  />
                </DetailsCard>
              ) : null}
              <BankAccountCard request={request} />
              <HistoryCard entries={request.history} />
            </>
          }
        >
          {request.status === "rejected" && request.rejectionReason ? (
            <RejectionNote reason={request.rejectionReason} />
          ) : null}
          {voided && "voidReason" in request && request.voidReason ? (
            <RejectionNote label="Void" reason={request.voidReason} />
          ) : null}

          <LineItemsTable
            canApprove={canApprove}
            generatingVoucherId={generatingVoucherId}
            onGenerateVoucher={handleGenerateVoucher}
            request={request}
            total={total}
            voided={voided}
          />

          {request.status === "approved" && approvalScreenshot ? (
            <RecordSection title="Payment proof">
              <div className="flex items-center gap-3 rounded-lg border p-2">
                <FilePreviewButton
                  src={getAttachmentPreviewHref(
                    approvalScreenshot,
                    approvalScreenshotRef
                  )}
                  fileName="Payment proof"
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
                </FilePreviewButton>
                <span className="min-w-0 flex-1 text-sm">
                  Screenshot of the payment
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
          {/* Only for those who can add it: the claimant needn't see it. */}
          {showPaymentProof && !approvalScreenshot ? (
            <RecordSection title="Payment proof">
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3"
                data-testid="payment-proof-missing"
              >
                <span className="min-w-0 flex-1 text-sm">
                  No payment screenshot. The books post this claim once it has
                  one.
                </span>
                <Button
                  onClick={handleOpenPaymentProof}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={ImageUploadIcon}
                    strokeWidth={2}
                  />
                  Add payment proof
                </Button>
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
        <VoidDialog
          entityLabel="reimbursement"
          loading={voidLoading}
          onConfirm={handleVoid}
          onOpenChange={setVoidOpen}
          open={voidOpen}
        />
        {showPaymentProof ? (
          <PaymentProofDialog
            onOpenChange={handlePaymentProofOpenChange}
            open={paymentProofOpen}
            reimbursementId={request.id}
            replacing={hasPaymentProof}
          />
        ) : null}
        {showChangeClaimant ? (
          <ChangeClaimantDialog
            onOpenChange={setChangeClaimantOpen}
            open={changeClaimantOpen}
            request={request}
          />
        ) : null}
      </div>
    </AppErrorBoundary>
  );
}

/**
 * The name of whoever raised the request when it isn't the claimant (finance
 * raising it on their behalf); undefined for the claimant's own.
 */
function raisedByOther(request: RequestDetailData): string | undefined {
  if (!isReimbursement(request)) {
    return;
  }
  const { creator } = request;
  return creator && creator.id !== request.userId ? creator.name : undefined;
}

function VoucherCell({
  attachments,
  canApprove,
  canUploadSigned,
  isApproved,
  isGenerating,
  item,
  limitPaise,
  onGenerate,
  reimbursementId,
  voided,
}: {
  attachments: ReimbursementDetailData["attachments"];
  canApprove: boolean;
  canUploadSigned: boolean;
  isApproved: boolean;
  isGenerating: boolean;
  item: {
    amountPaise: number;
    generateVoucher?: boolean | null;
    id: string;
    signedVoucherAttachmentId?: string | null;
    voucherAttachmentId?: string | null;
  };
  limitPaise: number;
  onGenerate: (lineItemId: string) => void;
  reimbursementId: string;
  /** Voided: the voucher stays (its number stays used) marked VOID. */
  voided: boolean;
}) {
  const { amountPaise } = item;
  // A voucher made under a higher limit stays; only new ones need the current limit.
  const isQualifying = qualifiesForCashVoucher(amountPaise, limitPaise);
  const handleGenerate = useEventCallback(() => onGenerate(item.id));

  if (item.voucherAttachmentId) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            className="text-success-foreground size-3.5"
            icon={TickDouble02Icon}
            strokeWidth={2}
          />
          <span className="text-success-foreground text-xs">Generated</span>
          {voided ? (
            <StatusBadge data-testid="voucher-void" tone="danger">
              VOID
            </StatusBadge>
          ) : null}
          {canApprove && isApproved && isQualifying && !voided ? (
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
        <VoucherSignedCopy
          attachments={attachments}
          canUpload={canUploadSigned && isApproved && !voided}
          lineItemId={item.id}
          reimbursementId={reimbursementId}
          signedVoucherAttachmentId={item.signedVoucherAttachmentId}
          voucherAttachmentId={item.voucherAttachmentId}
        />
      </div>
    );
  }

  if (voided) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  if (item.generateVoucher && isApproved && !isQualifying) {
    return (
      <span className="text-muted-foreground text-xs">
        Over the {formatCashVoucherLimit(limitPaise)} voucher limit
      </span>
    );
  }

  if (item.generateVoucher && isApproved) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Pending...</span>
        {canApprove ? (
          <Button
            className="ml-1 h-auto px-1.5 py-0.5 text-xs pointer-coarse:h-8 pointer-coarse:px-2.5"
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
        className="h-auto px-2 py-1 text-xs pointer-coarse:h-8"
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

/**
 * Who a voucher item paid: the named payee, or the claimant when none is
 * stored, which is what the voucher prints.
 */
function PaidToLine({
  claimantName,
  item,
}: {
  claimantName: string | undefined;
  item: RequestDetailData["lineItems"][number];
}) {
  if (!("payeeName" in item)) {
    return null;
  }
  if (item.payeeName) {
    return <span className="block text-xs">Paid to {item.payeeName}</span>;
  }
  if (!item.generateVoucher) {
    return null;
  }
  return (
    <span className="block text-xs">
      Paid to {claimantName ?? "the claimant"} (claimant)
    </span>
  );
}

/**
 * On phones each line item stacks: category and amount, then the description
 * lines, then the voucher, instead of four squeezed columns.
 */
const LINE_ITEM_STACK =
  "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-2.5";

function LineItemsTable({
  canApprove,
  generatingVoucherId,
  onGenerateVoucher,
  request,
  total,
  voided,
}: {
  canApprove: boolean;
  generatingVoucherId: string | null;
  onGenerateVoucher: (lineItemId: string) => void;
  request: RequestDetailData;
  total: number;
  voided: boolean;
}) {
  const isReimb = isReimbursement(request);
  const showVoucherCol = isReimb && request.status === "approved";
  const voucherLimitPaise = useCashVoucherLimit();
  const { hasPermission, user } = useApp();
  // The claimant, finance or an approver may attach the signed copy.
  const canUploadSigned =
    request.userId === user.id ||
    hasPermission("finance.manage") ||
    hasPermission("requests.approve");
  // The payee signs on the dashboard until the request is approved.
  const canCollectSignature =
    isReimb &&
    canCollectPayeeSignature({
      hasPermission,
      request,
      userId: user.id,
      voided,
    });

  return (
    <RecordSection title="Line items">
      {request.lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm max-md:block">
            <thead className="max-md:hidden">
              <tr className="bg-muted/40 text-muted-foreground border-b text-xs">
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                {showVoucherCol ? (
                  <th className="px-3 py-2 text-left font-medium">Voucher</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="max-md:block">
              {request.lineItems.map((item) => (
                <tr
                  className={`border-b last:border-0 ${LINE_ITEM_STACK}`}
                  key={item.id}
                >
                  <td className="px-3 py-2 max-md:p-0 max-md:font-medium">
                    {item.category?.name}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 max-md:col-span-full max-md:p-0">
                    {item.description}
                    <PaidToLine claimantName={request.user?.name} item={item} />
                    {isReimb ? (
                      <PayeeSignatureLine
                        attachments={request.attachments}
                        canCollect={canCollectSignature}
                        expenseDate={request.expenseDate}
                        item={item}
                        limitPaise={voucherLimitPaise}
                        reimbursementId={request.id}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:p-0">
                    {formatPaise(item.amountPaise)}
                  </td>
                  {showVoucherCol ? (
                    <td className="px-3 py-2 max-md:col-span-full max-md:flex max-md:items-center max-md:gap-2 max-md:p-0">
                      <span className="text-muted-foreground text-xs md:hidden">
                        Voucher
                      </span>
                      <VoucherCell
                        attachments={isReimb ? request.attachments : []}
                        canApprove={canApprove}
                        canUploadSigned={canUploadSigned}
                        isApproved={request.status === "approved"}
                        isGenerating={generatingVoucherId === item.id}
                        item={item}
                        limitPaise={voucherLimitPaise}
                        onGenerate={onGenerateVoucher}
                        reimbursementId={request.id}
                        voided={voided}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot className="max-md:block">
              <tr className={`bg-muted/40 border-t ${LINE_ITEM_STACK}`}>
                <td
                  className="px-3 py-2 font-medium max-md:p-0"
                  colSpan={showVoucherCol ? 2 : 2}
                >
                  Total
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums max-md:p-0">
                  {formatPaise(total)}
                </td>
                {showVoucherCol ? <td className="max-md:hidden" /> : null}
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
    upi: request.bankAccountUpiId?.trim() || null,
  };
}

/** How finance can pay: whichever the claimant saved, their pick when both. */
function payByLabel(bank: ReturnType<typeof getBankDetails>): string | null {
  if (bank.number && bank.upi) {
    return "Bank transfer or UPI";
  }
  if (bank.upi) {
    return "UPI";
  }
  return bank.number ? "Bank transfer" : null;
}

function BankAccountCard({ request }: { request: RequestDetailData }) {
  const bank = getBankDetails(request);

  if (!(bank.name || bank.number || bank.ifsc || bank.upi)) {
    return null;
  }
  const payBy = payByLabel(bank);

  return (
    <DetailsCard title="Paid to">
      {payBy ? <DetailsRow label="Pay by">{payBy}</DetailsRow> : null}
      {bank.name ? <DetailsRow label="Name">{bank.name}</DetailsRow> : null}
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
      {bank.upi ? (
        <DetailsRow label="UPI ID or number">
          <span className="font-mono">{bank.upi}</span>
        </DetailsRow>
      ) : null}
    </DetailsCard>
  );
}
