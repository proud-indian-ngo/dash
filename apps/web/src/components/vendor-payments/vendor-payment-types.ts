import type {
  ExpenseCategory,
  TeamEvent,
  User,
  Vendor,
  VendorPayment,
  VendorPaymentAttachment,
  VendorPaymentHistory,
  VendorPaymentLineItem,
  VendorPaymentTransaction,
  VendorPaymentTransactionAttachment,
  VendorPaymentTransactionHistory,
} from "@pi-dash/zero/schema";

export type VendorPaymentTransactionWithRelations = VendorPaymentTransaction & {
  user: User | undefined;
  attachments: readonly VendorPaymentTransactionAttachment[];
  history: ReadonlyArray<
    VendorPaymentTransactionHistory & { actor?: User | undefined }
  >;
};

export type VendorPaymentWithRelations = VendorPayment & {
  lineItems: ReadonlyArray<
    VendorPaymentLineItem & { category: ExpenseCategory | undefined }
  >;
  attachments: readonly VendorPaymentAttachment[];
  history: ReadonlyArray<VendorPaymentHistory & { actor?: User | undefined }>;
  invoiceReviewer: User | undefined;
  user: User | undefined;
  vendor: Vendor | undefined;
  transactions: readonly VendorPaymentTransactionWithRelations[];
  event: TeamEvent | undefined;
};
