import {
  isIndianMobile,
  isLatinName,
  PAYEE_NAME_MAX,
  PAYEE_NAME_REQUIRED_MESSAGE,
  PAYEE_NAME_SCRIPT_MESSAGE,
  PAYEE_PHONE_MESSAGE,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import { cityValues } from "@pi-dash/shared/constants";
import {
  MAX_AMOUNT_MESSAGE,
  MAX_AMOUNT_PAISE,
  RUPEES_INPUT_MESSAGE,
  rupeesToPaise,
  sumPaise,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import capitalize from "lodash/capitalize";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const MAX_ATTACHMENT_FILES = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export const cityOptions = cityValues.map((value) => ({
  label: capitalize(value),
  value,
}));

/** A positive rupee amount typed into a form, within the per-item limit. */
export const positiveRupeesSchema = z
  .string()
  .min(1, "Amount required")
  .superRefine((value, context) => {
    const paise = tryRupeesToPaise(value);
    if (paise === null) {
      context.addIssue({ code: "custom", message: RUPEES_INPUT_MESSAGE });
    } else if (paise <= 0) {
      context.addIssue({ code: "custom", message: "Must be greater than 0" });
    } else if (paise > MAX_AMOUNT_PAISE) {
      context.addIssue({ code: "custom", message: MAX_AMOUNT_MESSAGE });
    }
  });

export const lineItemSchema = z.object({
  amount: positiveRupeesSchema,
  categoryId: z.string().min(1, "Category required"),
  description: z.string().trim().min(1, "Description required"),
  generateVoucher: z.boolean().optional(),
  id: z.string(),
  /** Who a cash voucher pays; required on an eligible, ticked item. */
  payeeName: z.string().max(PAYEE_NAME_MAX).optional(),
  /** The cash-voucher payee's mobile, E.164 from the phone input; optional. */
  payeePhone: z.string().optional(),
});

/**
 * Checks the voucher payee on line items that will actually get a voucher:
 * ticked and within `limitPaise`. The payee fields are hidden, and cleared,
 * on any other item, so they must not block the form.
 */
export function addVoucherPayeeIssues(
  lineItems: readonly LineItem[],
  limitPaise: number,
  context: z.RefinementCtx
): void {
  for (const [index, item] of lineItems.entries()) {
    const paise = tryRupeesToPaise(item.amount);
    if (
      !item.generateVoucher ||
      paise === null ||
      !qualifiesForCashVoucher(paise, limitPaise)
    ) {
      continue;
    }
    const name = item.payeeName?.trim() ?? "";
    if (!name) {
      context.addIssue({
        code: "custom",
        message: PAYEE_NAME_REQUIRED_MESSAGE,
        path: ["lineItems", index, "payeeName"],
      });
    } else if (!isLatinName(name)) {
      context.addIssue({
        code: "custom",
        message: PAYEE_NAME_SCRIPT_MESSAGE,
        path: ["lineItems", index, "payeeName"],
      });
    }
    if (item.payeePhone && !isIndianMobile(item.payeePhone)) {
      context.addIssue({
        code: "custom",
        message: PAYEE_PHONE_MESSAGE,
        path: ["lineItems", index, "payeePhone"],
      });
    }
  }
}

export const attachmentSchema = z.discriminatedUnion("type", [
  z.object({
    filename: z.string().min(1),
    id: z.string(),
    mimeType: z.string().optional(),
    objectKey: z.string().min(1),
    type: z.literal("file"),
  }),
  z.object({
    id: z.string(),
    type: z.literal("url"),
    url: z.string().url("Must be a valid URL"),
  }),
]);

export type LineItem = z.infer<typeof lineItemSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

export const newLineItem = (): LineItem => ({
  amount: "",
  categoryId: "",
  description: "",
  generateVoucher: false,
  id: uuidv7(),
  payeeName: "",
  payeePhone: "",
});

/** Running total in paise of the rupee amounts typed so far; invalid entries count as 0. */
export const computeRunningTotalPaise = (lineItems: LineItem[]): number =>
  sumPaise(lineItems.map((item) => tryRupeesToPaise(item.amount) ?? 0));

/**
 * Validated form line items to mutator line items: rupee text becomes paise
 * and order becomes sortOrder. The voucher tick and payee go out only for
 * items that will get a voucher (ticked and within `voucherLimitPaise`);
 * hidden fields keep their values in the form, so retyping an amount brings
 * them back filled, but never reach the server. Without a limit (vendor
 * payments) no item is eligible.
 */
export const toLineItemsPayload = <
  T extends {
    amount: string;
    generateVoucher?: boolean;
    payeeName?: string;
    payeePhone?: string;
  },
>(
  lineItems: readonly T[],
  voucherLimitPaise?: number
): (Omit<T, "amount" | "generateVoucher" | "payeeName" | "payeePhone"> & {
  amountPaise: number;
  generateVoucher: boolean;
  payeeName: string | null;
  payeePhone: string | null;
  sortOrder: number;
})[] =>
  lineItems.map(
    ({ amount, generateVoucher, payeeName, payeePhone, ...item }, index) => {
      const amountPaise = rupeesToPaise(amount);
      const voucher =
        Boolean(generateVoucher) &&
        voucherLimitPaise !== undefined &&
        qualifiesForCashVoucher(amountPaise, voucherLimitPaise);
      return {
        ...item,
        amountPaise,
        generateVoucher: voucher,
        payeeName: (voucher && payeeName?.trim().normalize("NFC")) || null,
        payeePhone: (voucher && payeePhone) || null,
        sortOrder: index,
      };
    }
  );
