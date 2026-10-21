import {
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  CASH_VOUCHER_LIMIT_RANGE_MESSAGE,
  isValidCashVoucherLimitValue,
} from "@pi-dash/shared/cash-voucher";
import {
  parseReturnRegistration,
  RETURN_REGISTRATION_CONFIG_KEY,
} from "@pi-dash/shared/donations-return";
import {
  isValidVolunteerHourValue,
  VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
  VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE,
} from "@pi-dash/shared/outcomes";
import { PAYEE_SIGNATURE_MIME_TYPE } from "@pi-dash/shared/payee-signature";
import {
  parseReceiptSettings,
  RECEIPT_SETTINGS_ADDRESS_MAX,
  RECEIPT_SETTINGS_CONFIG_KEY,
  RECEIPT_SETTINGS_TEXT_MAX,
  RECEIPT_SIGNATURE_DURABLE_PREFIX,
  serializeReceiptSettings,
} from "@pi-dash/shared/receipts";
import { SOCIAL_MANAGE_CONFIG_KEYS } from "@pi-dash/shared/social-api";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
} from "./submission-helpers";

const socialManageKeys = new Set(SOCIAL_MANAGE_CONFIG_KEYS);

/**
 * `settings.app_config` may write every key; `social.manage` may write only
 * the social settings keys shown on the Social page; `finance.manage` may
 * write only the cash-voucher limit, the 80G registration used by the donations return, the receipt
 * details and the hourly value of volunteer time.
 */
export function assertCanWriteAppConfig(
  ctx: Context | undefined,
  key: string
): void {
  assertIsLoggedIn(ctx);
  if (can(ctx, "settings.app_config")) {
    return;
  }
  if (socialManageKeys.has(key) && can(ctx, "social.manage")) {
    return;
  }
  if (
    (key === CASH_VOUCHER_LIMIT_CONFIG_KEY ||
      key === RETURN_REGISTRATION_CONFIG_KEY ||
      key === RECEIPT_SETTINGS_CONFIG_KEY ||
      key === VOLUNTEER_HOUR_VALUE_CONFIG_KEY) &&
    can(ctx, "finance.manage")
  ) {
    return;
  }
  throw new Error("Unauthorized");
}

/** Values that drive finance controls must be whole, safe paise amounts. */
export function assertValidAppConfigValue(key: string, value: string): void {
  if (key === RETURN_REGISTRATION_CONFIG_KEY) {
    if (!parseReturnRegistration(value)) {
      throw new Error(
        "The 80G registration needs a URN, its date of issue and a section code"
      );
    }
    return;
  }
  if (key === RECEIPT_SETTINGS_CONFIG_KEY) {
    // Only saveReceiptSettings may write it: it alone sets the signature
    // key, from an upload it claims, so nothing can point receipts at
    // another stored file.
    throw new Error("Save the receipt details from Settings");
  }
  if (key === CASH_VOUCHER_LIMIT_CONFIG_KEY) {
    if (!isValidCashVoucherLimitValue(value)) {
      throw new Error(CASH_VOUCHER_LIMIT_RANGE_MESSAGE);
    }
    return;
  }
  if (
    key === VOLUNTEER_HOUR_VALUE_CONFIG_KEY &&
    !isValidVolunteerHourValue(value)
  ) {
    throw new Error(VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE);
  }
}

const receiptText = (max: number) => z.string().trim().min(1).max(max);

const saveReceiptSettingsSchema = z.object({
  orgAddress: receiptText(RECEIPT_SETTINGS_ADDRESS_MAX),
  orgName: receiptText(RECEIPT_SETTINGS_TEXT_MAX),
  orgPan: receiptText(10),
  signatoryDesignation: receiptText(RECEIPT_SETTINGS_TEXT_MAX),
  signatoryName: receiptText(RECEIPT_SETTINGS_TEXT_MAX),
  /** A new signature PNG's temporary upload key; null keeps the stored one. */
  signatureUpload: z.string().min(1).nullable(),
});

export const appConfigMutators = {
  /** Clear an optional key so readers fall back to their default. */
  remove: defineMutator(
    z.object({ key: z.string().min(1) }),
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, args.key);
      await tx.mutate.appConfig.delete({ key: args.key });
    }
  ),
  /**
   * The trust's particulars and the signatory's signature for receipts. A
   * new signature is claimed from its upload with the payee signature's
   * checks (PNG, size, dimensions). A replaced one stays in storage: issued
   * receipts keep the signature they were issued with.
   */
  saveReceiptSettings: defineMutator(
    saveReceiptSettingsSchema,
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, RECEIPT_SETTINGS_CONFIG_KEY);
      const stored = parseReceiptSettings(
        (
          await tx.run(
            zql.appConfig.where("key", RECEIPT_SETTINGS_CONFIG_KEY).one()
          )
        )?.value
      );
      const signatureKey = args.signatureUpload
        ? claimUploadedR2ObjectKey(
            args.signatureUpload,
            createR2ClaimOptions(ctx, tx.location, {
              contentCheck: "payeeSignature",
              durablePrefix: RECEIPT_SIGNATURE_DURABLE_PREFIX,
              mimeType: PAYEE_SIGNATURE_MIME_TYPE,
              subfolder: "attachments",
            })
          )
        : stored?.signatureKey;
      if (!signatureKey) {
        throw new Error("Upload the signatory's signature");
      }
      const value = serializeReceiptSettings({
        orgAddress: args.orgAddress,
        orgName: args.orgName,
        orgPan: args.orgPan,
        signatoryDesignation: args.signatoryDesignation,
        signatoryName: args.signatoryName,
        signatureKey,
      });
      if (!parseReceiptSettings(value)) {
        throw new Error(
          "The receipt details need the trust's name, address, a valid PAN and the signatory's name and designation"
        );
      }
      await tx.mutate.appConfig.upsert({
        key: RECEIPT_SETTINGS_CONFIG_KEY,
        updatedAt: Date.now(),
        value,
      });
    }
  ),
  upsert: defineMutator(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, args.key);
      assertValidAppConfigValue(args.key, args.value);
      await tx.mutate.appConfig.upsert({
        key: args.key,
        updatedAt: Date.now(),
        value: args.value,
      });
    }
  ),
};
