import type {
  AdvancePayment,
  AdvancePaymentAttachment,
  AdvancePaymentHistory,
  AdvancePaymentLineItem,
  ExpenseCategory,
  Reimbursement,
  ReimbursementAttachment,
  ReimbursementHistory,
  ReimbursementLineItem,
  User,
  Vendor,
  VendorPayment,
  VendorPaymentAttachment,
  VendorPaymentHistory,
  VendorPaymentLineItem,
} from "@pi-dash/zero/schema";

export type RequestType =
  | "reimbursement"
  | "advance_payment"
  | "vendor_payment";

export type ReimbursementRequestRow = Reimbursement & {
  type: "reimbursement";
  lineItems: ReadonlyArray<
    ReimbursementLineItem & { category: ExpenseCategory | undefined }
  >;
  user: User | undefined;
};

export type AdvancePaymentRequestRow = AdvancePayment & {
  type: "advance_payment";
  lineItems: ReadonlyArray<
    AdvancePaymentLineItem & { category: ExpenseCategory | undefined }
  >;
  user: User | undefined;
};

export type VendorPaymentRequestRow = VendorPayment & {
  type: "vendor_payment";
  lineItems: ReadonlyArray<
    VendorPaymentLineItem & { category: ExpenseCategory | undefined }
  >;
  user: User | undefined;
  vendor: Vendor | undefined;
};

export type RequestRow =
  | ReimbursementRequestRow
  | AdvancePaymentRequestRow
  | VendorPaymentRequestRow;

export type ReimbursementDetailData = Reimbursement & {
  type: "reimbursement";
  lineItems: ReadonlyArray<
    ReimbursementLineItem & { category: ExpenseCategory | undefined }
  >;
  attachments: readonly ReimbursementAttachment[];
  history: ReadonlyArray<ReimbursementHistory & { actor?: User | undefined }>;
  user: User | undefined;
};

export type AdvancePaymentDetailData = AdvancePayment & {
  type: "advance_payment";
  lineItems: ReadonlyArray<
    AdvancePaymentLineItem & { category: ExpenseCategory | undefined }
  >;
  attachments: readonly AdvancePaymentAttachment[];
  history: ReadonlyArray<AdvancePaymentHistory & { actor?: User | undefined }>;
  user: User | undefined;
};

export type VendorPaymentDetailData = VendorPayment & {
  type: "vendor_payment";
  lineItems: ReadonlyArray<
    VendorPaymentLineItem & { category: ExpenseCategory | undefined }
  >;
  attachments: readonly VendorPaymentAttachment[];
  history: ReadonlyArray<VendorPaymentHistory & { actor?: User | undefined }>;
  user: User | undefined;
  vendor: Vendor | undefined;
};

export type RequestDetailData =
  | ReimbursementDetailData
  | AdvancePaymentDetailData
  | VendorPaymentDetailData;

export function isReimbursement(
  row: RequestRow
): row is ReimbursementRequestRow;
export function isReimbursement(
  row: RequestDetailData
): row is ReimbursementDetailData;
export function isReimbursement(row: RequestRow | RequestDetailData): boolean {
  return row.type === "reimbursement";
}

export function isVendorPayment(
  row: RequestRow
): row is VendorPaymentRequestRow;
export function isVendorPayment(
  row: RequestDetailData
): row is VendorPaymentDetailData;
export function isVendorPayment(row: RequestRow | RequestDetailData): boolean {
  return row.type === "vendor_payment";
}

export const REQUEST_TYPE_LABELS = {
  reimbursement: "Reimbursement",
  advance_payment: "Advance Payment",
  vendor_payment: "Vendor Payment",
} satisfies Record<RequestType, string>;

export function normalizeToRequestRows(
  reimbursements: readonly Omit<ReimbursementRequestRow, "type">[],
  advancePayments: readonly Omit<AdvancePaymentRequestRow, "type">[],
  vendorPayments: readonly Omit<VendorPaymentRequestRow, "type">[] = []
): RequestRow[] {
  const reimbursementRows: RequestRow[] = reimbursements.map((r) => ({
    ...r,
    type: "reimbursement" as const,
  }));
  const advancePaymentRows: RequestRow[] = advancePayments.map((ap) => ({
    ...ap,
    type: "advance_payment" as const,
  }));
  const vendorPaymentRows: RequestRow[] = vendorPayments.map((vp) => ({
    ...vp,
    type: "vendor_payment" as const,
  }));

  return [
    ...reimbursementRows,
    ...advancePaymentRows,
    ...vendorPaymentRows,
  ].sort((a, b) => b.createdAt - a.createdAt);
}
