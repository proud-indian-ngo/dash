import z from "zod";

export const requestExportStatusValues = [
  "pending",
  "approved",
  "rejected",
] as const;
export type RequestExportStatus = (typeof requestExportStatusValues)[number];

export const requestExportTypeValues = [
  "reimbursement",
  "advancePayment",
] as const;
export type RequestExportType = (typeof requestExportTypeValues)[number];

export const vendorPaymentExportStatusValues = [
  "pending",
  "approved",
  "rejected",
  "partially_paid",
  "paid",
  "invoice_pending",
  "completed",
] as const;
export type VendorPaymentExportStatus =
  (typeof vendorPaymentExportStatusValues)[number];

const financialExportInputSchema = z
  .object({
    fyStart: z.number().int().min(2020).max(2099),
    includeTransactions: z.boolean(),
    includeVendorPayments: z.boolean(),
    requestStatuses: z.array(z.enum(requestExportStatusValues)).optional(),
    requestTypes: z.array(z.enum(requestExportTypeValues)),
    vendorPaymentStatuses: z
      .array(z.enum(vendorPaymentExportStatusValues))
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (!(input.includeVendorPayments || input.requestTypes.length > 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one data type",
        path: ["requestTypes"],
      });
    }
    if (input.requestTypes.length > 0 && input.requestStatuses?.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one request status",
        path: ["requestStatuses"],
      });
    }
    if (
      input.includeVendorPayments &&
      input.vendorPaymentStatuses?.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one vendor payment status",
        path: ["vendorPaymentStatuses"],
      });
    }
  });

export type FinancialExportInput = z.infer<typeof financialExportInputSchema>;

const getOptionalValues = (params: URLSearchParams, name: string) =>
  params.has(name) ? params.getAll(name) : undefined;

export function parseFinancialExportSearchParams(params: URLSearchParams) {
  const fyStart = Number(params.get("fyStart"));
  return financialExportInputSchema.safeParse({
    fyStart,
    includeTransactions: params.get("includeTransactions") === "true",
    includeVendorPayments: params.get("includeVendorPayments") === "true",
    requestStatuses: getOptionalValues(params, "requestStatus"),
    requestTypes: params.getAll("requestType"),
    vendorPaymentStatuses: getOptionalValues(params, "vendorPaymentStatus"),
  });
}

export function buildFinancialExportUrl(input: FinancialExportInput): string {
  const params = new URLSearchParams({
    fyStart: String(input.fyStart),
    includeTransactions: String(input.includeTransactions),
    includeVendorPayments: String(input.includeVendorPayments),
  });
  for (const type of input.requestTypes) {
    params.append("requestType", type);
  }
  for (const status of input.requestStatuses ?? []) {
    params.append("requestStatus", status);
  }
  for (const status of input.vendorPaymentStatuses ?? []) {
    params.append("vendorPaymentStatus", status);
  }
  return `/api/financial-export?${params.toString()}`;
}

export function buildFinancialExportFilename(
  fyStart: number,
  today: string
): string {
  return `financial-exports_FY${fyStart}-${String(fyStart + 1).slice(2)}_${today}.zip`;
}
