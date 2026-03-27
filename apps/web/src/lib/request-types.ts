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
} from "@pi-dash/zero/schema";

export type RequestType = "reimbursement" | "advance_payment";

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

export type RequestRow = ReimbursementRequestRow | AdvancePaymentRequestRow;

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

export type RequestDetailData =
  | ReimbursementDetailData
  | AdvancePaymentDetailData;

export function isReimbursement(
  row: RequestRow
): row is ReimbursementRequestRow;
export function isReimbursement(
  row: RequestDetailData
): row is ReimbursementDetailData;
export function isReimbursement(row: RequestRow | RequestDetailData): boolean {
  return row.type === "reimbursement";
}

export const REQUEST_TYPE_LABELS = {
  reimbursement: "Reimbursement",
  advance_payment: "Advance Payment",
} satisfies Record<RequestType, string>;

export function normalizeToRequestRows(
  reimbursements: readonly Omit<ReimbursementRequestRow, "type">[],
  advancePayments: readonly Omit<AdvancePaymentRequestRow, "type">[]
): RequestRow[] {
  const reimbursementRows: RequestRow[] = reimbursements.map((r) => ({
    ...r,
    type: "reimbursement" as const,
  }));
  const advancePaymentRows: RequestRow[] = advancePayments.map((ap) => ({
    ...ap,
    type: "advance_payment" as const,
  }));

  return [...reimbursementRows, ...advancePaymentRows].sort(
    (a, b) => b.createdAt - a.createdAt
  );
}
