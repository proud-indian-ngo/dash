import {
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  CASH_VOUCHER_LIMIT_RANGE_MESSAGE,
  isValidCashVoucherLimitValue,
} from "@pi-dash/shared/cash-voucher";
import {
  APP_CONFIG_FINANCE_THRESHOLD_KEY,
  MAX_PAISE,
} from "@pi-dash/shared/constants";
import {
  parseReturnRegistration,
  RETURN_REGISTRATION_CONFIG_KEY,
} from "@pi-dash/shared/donations-return";
import {
  isValidVolunteerHourValue,
  VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
  VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE,
} from "@pi-dash/shared/outcomes";
import {
  parseReceiptSettings,
  RECEIPT_SETTINGS_CONFIG_KEY,
} from "@pi-dash/shared/receipts";
import { SOCIAL_MANAGE_CONFIG_KEYS } from "@pi-dash/shared/social-api";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";

const socialManageKeys = new Set(SOCIAL_MANAGE_CONFIG_KEYS);

/**
 * `settings.app_config` may write every key; `social.manage` may write only
 * the social settings keys shown on the Social page; `finance.manage` may
 * write only the default finance-approval threshold, the cash-voucher
 * limit, the 80G registration used by the donations return, the receipt
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
    (key === APP_CONFIG_FINANCE_THRESHOLD_KEY ||
      key === CASH_VOUCHER_LIMIT_CONFIG_KEY ||
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
    if (!parseReceiptSettings(value)) {
      throw new Error(
        "The receipt details need the trust's name, address, a valid PAN and the signatory's name and designation"
      );
    }
    return;
  }
  if (key === CASH_VOUCHER_LIMIT_CONFIG_KEY) {
    if (!isValidCashVoucherLimitValue(value)) {
      throw new Error(CASH_VOUCHER_LIMIT_RANGE_MESSAGE);
    }
    return;
  }
  if (key === VOLUNTEER_HOUR_VALUE_CONFIG_KEY) {
    if (!isValidVolunteerHourValue(value)) {
      throw new Error(VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE);
    }
    return;
  }
  if (key !== APP_CONFIG_FINANCE_THRESHOLD_KEY) {
    return;
  }
  if (!/^\d{1,16}$/.test(value) || Number(value) > MAX_PAISE) {
    throw new Error("Threshold must be a whole number of paise");
  }
}

export const appConfigMutators = {
  /** Clear an optional key so readers fall back to their default. */
  remove: defineMutator(
    z.object({ key: z.string().min(1) }),
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, args.key);
      await tx.mutate.appConfig.delete({ key: args.key });
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
