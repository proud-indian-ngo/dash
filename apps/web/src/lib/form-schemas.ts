import {
  isIndianMobile,
  isLatinName,
  PAYEE_NAME_MAX,
  PAYEE_NAME_REQUIRED_MESSAGE,
  PAYEE_NAME_SCRIPT_MESSAGE,
  PAYEE_PHONE_MESSAGE,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import {
  MAX_AMOUNT_MESSAGE,
  MAX_AMOUNT_PAISE,
  RUPEES_INPUT_MESSAGE,
  rupeesToPaise,
  sumPaise,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const MAX_ATTACHMENT_FILES = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

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
  /**
   * The claimant was paid: the payee fields are hidden and the voucher
   * prints the claimant. Only meaningful on a voucher item.
   */
  payeeIsClaimant: z.boolean().optional(),
  /** Who a cash voucher pays; required on an eligible, ticked item. */
  payeeName: z.string().max(PAYEE_NAME_MAX).optional(),
  /** The cash-voucher payee's mobile, E.164 from the phone input; optional. */
  payeePhone: z.string().optional(),
});

/**
 * Checks the voucher payee on line items that will actually get a voucher:
 * ticked and within `limitPaise`, and not paid to the claimant. The payee
 * fields are hidden, and cleared, on any other item, so they must not block
 * the form.
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
      item.payeeIsClaimant ||
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
  // A cash voucher usually pays someone else, such as a labourer or driver.
  payeeIsClaimant: false,
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
 * them back filled, but never reach the server. An item paid to the
 * claimant sends `payeeIsClaimant` and no payee. Without a limit (vendor
 * payments) no item is eligible.
 */
export const toLineItemsPayload = <
  T extends {
    amount: string;
    generateVoucher?: boolean;
    payeeIsClaimant?: boolean;
    payeeName?: string;
    payeePhone?: string;
  },
>(
  lineItems: readonly T[],
  voucherLimitPaise?: number
): (Omit<
  T,
  "amount" | "generateVoucher" | "payeeIsClaimant" | "payeeName" | "payeePhone"
> & {
  amountPaise: number;
  generateVoucher: boolean;
  payeeIsClaimant: boolean;
  payeeName: string | null;
  payeePhone: string | null;
  sortOrder: number;
})[] =>
  lineItems.map(
    (
      {
        amount,
        generateVoucher,
        payeeIsClaimant,
        payeeName,
        payeePhone,
        ...item
      },
      index
    ) => {
      const amountPaise = rupeesToPaise(amount);
      const voucher =
        Boolean(generateVoucher) &&
        voucherLimitPaise !== undefined &&
        qualifiesForCashVoucher(amountPaise, voucherLimitPaise);
      const toClaimant = voucher && Boolean(payeeIsClaimant);
      const named = voucher && !toClaimant;
      return {
        ...item,
        amountPaise,
        generateVoucher: voucher,
        payeeIsClaimant: toClaimant,
        payeeName: (named && payeeName?.trim().normalize("NFC")) || null,
        payeePhone: (named && payeePhone) || null,
        sortOrder: index,
      };
    }
  );
