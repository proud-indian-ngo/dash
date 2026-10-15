import {
  type ContributionChannel,
  contributionChannelValues,
  contributionReportingModeValues,
  deductionEligibleValues,
  donationTypeValues,
} from "@pi-dash/shared/constants";
import {
  type ChannelAndAccount,
  keepsFixedAccount,
} from "@pi-dash/shared/contribution-channel";
import { ELIGIBILITY_REASON_MAX } from "@pi-dash/shared/donations-return";
import { contributionRuleIssues } from "@pi-dash/shared/income";
import z from "zod";

import { positiveRupeesSchema } from "@/lib/form-schemas";

/** Validation for the contribution form, kept apart from the dialog so it can be tested. */

/** The reason picker's value for a reason typed by hand. */
export const OTHER_REASON = "other";

const text = (max: number) => z.string().trim().max(max);
/** A required picker: empty until chosen, so the input type allows undefined. */
const pick = (message: string) =>
  z
    .string()
    .optional()
    .refine((value) => Boolean(value), message);
const requiredDate = (message: string) =>
  z
    .date()
    .optional()
    .refine((value) => value !== undefined, message);

const baseSchema = z.object({
  amount: positiveRupeesSchema,
  channel: z.enum(contributionChannelValues),
  deductionEligible: z.enum(deductionEligibleValues),
  donationType: z.enum(donationTypeValues),
  donationTypeDescription: text(200),
  eligibilityReasonChoice: z.string(),
  eligibilityReasonOther: text(ELIGIBILITY_REASON_MAX),
  fundId: pick("Pick a fund"),
  inKindDescription: text(500),
  inKindValuationBasis: text(500),
  notes: text(1000),
  orgAccountId: z.string().optional(),
  partyId: pick("Pick a donor"),
  programmeId: z.string().optional(),
  projectId: z.string().optional(),
  receivedOn: requiredDate("Pick the date it was received"),
  reference: text(120),
  reportingMode: z.enum(contributionReportingModeValues),
  reportingModeDescription: text(200),
});

export type FormValues = z.input<typeof baseSchema>;

/**
 * The form's rules: the shared contribution rules, the reason picker, and
 * whether the account fits the channel (`accountIssue`, which needs the
 * synced accounts and settings), unless a lock keeps the stored account.
 */
export function buildFormSchema(
  accountIssue: (
    channel: ContributionChannel,
    accountId: string | undefined
  ) => string | null,
  fixedAccount: { locked: boolean; stored: ChannelAndAccount | null } = {
    locked: false,
    stored: null,
  }
) {
  return baseSchema.superRefine((value, context) => {
    const issues = contributionRuleIssues({
      ...value,
      // A hidden account field never blocks an in-kind gift.
      orgAccountId: value.channel === "in_kind" ? null : value.orgAccountId,
    });
    for (const issue of issues) {
      context.addIssue({
        code: "custom",
        message: issue.message,
        path: [issue.path],
      });
    }
    if (value.deductionEligible === "no") {
      if (value.eligibilityReasonChoice === "") {
        context.addIssue({
          code: "custom",
          message: "Say why this gift is left out",
          path: ["eligibilityReasonChoice"],
        });
      } else if (
        value.eligibilityReasonChoice === OTHER_REASON &&
        value.eligibilityReasonOther.trim() === ""
      ) {
        context.addIssue({
          code: "custom",
          message: "Describe the reason",
          path: ["eligibilityReasonOther"],
        });
      }
    }
    // A refund or settlement fixed the channel and account: the server keeps
    // them too (`keepsFixedAccount`), so the other fields can still be saved.
    const accountMessage =
      value.channel === "in_kind" ||
      !value.orgAccountId ||
      keepsFixedAccount(fixedAccount.locked, value, fixedAccount.stored)
        ? null
        : accountIssue(value.channel, value.orgAccountId);
    if (accountMessage) {
      context.addIssue({
        code: "custom",
        message: accountMessage,
        path: ["orgAccountId"],
      });
    }
  });
}
