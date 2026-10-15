import type {
  ContributionChannel,
  ContributionReportingMode,
} from "./constants";

/**
 * What a contribution's channel decides: the account the money lands in and
 * the mode of receipt it is reported under in the donations return (Form
 * 113). The contribution form offers only what the channel allows, and the
 * contribution mutators refuse anything else.
 *
 * - Razorpay lands in the Razorpay clearing account (the `app_config`
 *   setting under {@link RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY}).
 * - give.do lands in a gateway clearing account other than Razorpay's; the
 *   form picks the one named for give.do ({@link defaultGiveDoAccount}).
 * - UPI, NEFT/IMPS and cheque land in a bank account; cash is deposited to
 *   the bank, or kept in a cash account.
 * - In-kind gifts have no account.
 */

/** The `app_config` key holding the Razorpay clearing account's ID. */
export const RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY =
  "razorpay_clearing_account_id";

/** The account fields the channel rules read. */
export interface ChannelAccount {
  id: string;
  kind: string;
  name: string;
}

/** Organisation-wide settings the channel rules read. */
export interface ChannelAccountSetup {
  razorpayClearingAccountId: string | null;
}

const GIVE_DO_ACCOUNT_NAME = /give/i;

/** The gateway clearing account named for give.do, if there is one. */
export function defaultGiveDoAccount<T extends { kind: string; name: string }>(
  accounts: readonly T[]
): T | undefined {
  return accounts.find(
    (a) => a.kind === "gateway_clearing" && GIVE_DO_ACCOUNT_NAME.test(a.name)
  );
}

const ELECTRONIC: readonly ContributionReportingMode[] = [
  "electronic_or_account_payee",
];

/** The modes of receipt each channel may be reported under; the first is the default (`defaultReportingMode`). */
export const CHANNEL_REPORTING_MODES: Record<
  ContributionChannel,
  readonly ContributionReportingMode[]
> = {
  cash: ["cash"],
  // A bearer cheque is reported as "other".
  cheque: ["electronic_or_account_payee", "other"],
  give_do: ELECTRONIC,
  in_kind: ["in_kind"],
  neft: ELECTRONIC,
  razorpay: ELECTRONIC,
  upi: ELECTRONIC,
};

/** Whether the channel fixes the reporting mode, leaving nothing to choose. */
export function isReportingModeFixed(channel: ContributionChannel): boolean {
  return CHANNEL_REPORTING_MODES[channel].length === 1;
}

const REPORTING_MODE_MESSAGES: Record<ContributionChannel, string> = {
  cash: "A cash gift is reported as cash",
  cheque:
    "A cheque gift is reported as electronic or account-payee cheque, or as other for a bearer cheque",
  give_do: "A give.do gift is reported as electronic or account-payee cheque",
  in_kind: "An in-kind gift is reported as in kind",
  neft: "A NEFT/IMPS gift is reported as electronic or account-payee cheque",
  razorpay: "A Razorpay gift is reported as electronic or account-payee cheque",
  upi: "A UPI gift is reported as electronic or account-payee cheque",
};

/** Why the reporting mode does not fit the channel, or null when it does. */
export function reportingModeIssue(
  channel: ContributionChannel,
  mode: ContributionReportingMode
): string | null {
  return CHANNEL_REPORTING_MODES[channel].includes(mode)
    ? null
    : REPORTING_MODE_MESSAGES[channel];
}

const BANK_CHANNEL_MESSAGES: Partial<Record<ContributionChannel, string>> = {
  cheque: "A cheque gift goes into a bank account",
  neft: "A NEFT/IMPS gift goes into a bank account",
  upi: "A UPI gift goes into a bank account",
};

/**
 * Why the account does not fit the channel, or null when it does. In-kind
 * gifts have no account, which `contributionRuleIssues` checks.
 */
export function channelAccountIssue(
  channel: ContributionChannel,
  account: Pick<ChannelAccount, "id" | "kind">,
  setup: ChannelAccountSetup
): string | null {
  const razorpayId = setup.razorpayClearingAccountId;
  switch (channel) {
    case "razorpay":
      if (!razorpayId) {
        return "Choose the Razorpay clearing account in Settings first";
      }
      return account.id === razorpayId && account.kind === "gateway_clearing"
        ? null
        : "A Razorpay gift goes into the Razorpay clearing account";
    case "give_do":
      return account.kind === "gateway_clearing" && account.id !== razorpayId
        ? null
        : "A give.do gift goes into the give.do clearing account";
    case "cash":
      return account.kind === "bank" || account.kind === "cash"
        ? null
        : "A cash gift goes into a bank or cash account";
    case "in_kind":
      return null;
    default:
      return account.kind === "bank"
        ? null
        : (BANK_CHANNEL_MESSAGES[channel] ?? null);
  }
}

export interface ChannelAccountChoice<T extends ChannelAccount> {
  /** The accounts the channel allows. */
  allowed: T[];
  /** Why there is nothing to pick, when the channel allows no account. */
  emptyReason: string | null;
  /** True when the channel fixes the account to `preferred`. */
  fixed: boolean;
  /** The account to fill in: the gateway's, or the only one allowed. */
  preferred: T | undefined;
}

/** The accounts a channel offers, which one to fill in, and whether it is fixed. */
export function channelAccountChoice<T extends ChannelAccount>(
  channel: ContributionChannel,
  accounts: readonly T[],
  setup: ChannelAccountSetup
): ChannelAccountChoice<T> {
  if (channel === "in_kind") {
    return {
      allowed: [],
      emptyReason: null,
      fixed: false,
      preferred: undefined,
    };
  }
  const allowed = accounts.filter(
    (account) => channelAccountIssue(channel, account, setup) === null
  );
  const gateway = channel === "razorpay" || channel === "give_do";
  const preferred =
    (channel === "give_do" ? defaultGiveDoAccount(allowed) : undefined) ??
    (allowed.length === 1 ? allowed[0] : undefined);
  let emptyReason: string | null = null;
  if (allowed.length === 0) {
    emptyReason =
      channel === "razorpay" && !setup.razorpayClearingAccountId
        ? "Choose the Razorpay clearing account in Settings first."
        : gateway
          ? `No active ${channel === "give_do" ? "give.do" : "Razorpay"} clearing account.`
          : channel === "cash"
            ? "No active bank or cash accounts."
            : "No active bank accounts.";
  }
  return {
    allowed,
    emptyReason,
    fixed: gateway && preferred !== undefined,
    preferred,
  };
}

/**
 * The account to show after the channel changes: the gateway's for a
 * gateway channel, the current one while it still fits, otherwise the only
 * allowed one, or nothing.
 */
export function accountForChannel<T extends ChannelAccount>(
  channel: ContributionChannel,
  current: string | null | undefined,
  accounts: readonly T[],
  setup: ChannelAccountSetup
): string | undefined {
  const choice = channelAccountChoice(channel, accounts, setup);
  if (choice.fixed) {
    return choice.preferred?.id;
  }
  if (current && choice.allowed.some((account) => account.id === current)) {
    return current;
  }
  return choice.preferred?.id;
}
