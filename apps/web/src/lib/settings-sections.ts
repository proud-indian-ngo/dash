import {
  BankIcon,
  Book02Icon,
  Briefcase01Icon,
  FolderLibraryIcon,
  Key01Icon,
  Location01Icon,
  NotificationIcon,
  PiggyBankIcon,
  PlugSocketIcon,
  SecurityLockIcon,
  Settings01Icon,
  ShieldIcon,
  SmartPhone01Icon,
  Tag01Icon,
  ToolsIcon,
  UserIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { PermissionId } from "@pi-dash/db/permissions";

export type SettingsGroup = "you" | "organization";

export interface SettingsSection {
  description: string;
  group: SettingsGroup;
  icon: typeof UserIcon;
  label: string;
  path: string;
  permission?: PermissionId;
}

/**
 * Every settings page, in nav order. The settings layout, breadcrumbs and the
 * route guards read this list, so a section is added in one place.
 */
export const SETTINGS_SECTIONS = [
  {
    description: "Your name, photo and contact details.",
    group: "you",
    icon: UserIcon,
    label: "Profile",
    path: "/settings/profile",
  },
  {
    description: "Your sign-in email and password.",
    group: "you",
    icon: ShieldIcon,
    label: "Account",
    path: "/settings/account",
  },
  {
    description: "Choose what reaches you, and where.",
    group: "you",
    icon: NotificationIcon,
    label: "Notifications",
    path: "/settings/notifications",
  },
  {
    description: "Where your reimbursements are paid.",
    group: "you",
    icon: BankIcon,
    label: "Bank accounts",
    path: "/settings/bank-accounts",
  },
  {
    description: "Settings that apply to everyone.",
    group: "organization",
    icon: Settings01Icon,
    label: "General",
    path: "/settings/general",
    permission: "settings.app_config",
  },
  {
    description: "What each role can see and do.",
    group: "organization",
    icon: SecurityLockIcon,
    label: "Roles",
    path: "/settings/roles",
    permission: "settings.roles",
  },
  {
    description:
      "Causes that events and money belong to, with each programme's lead, the value of a volunteer hour and the cash-voucher limit.",
    group: "organization",
    icon: Briefcase01Icon,
    label: "Programmes",
    path: "/settings/programmes",
    permission: "finance.manage",
  },
  {
    description:
      "Time-boxed pieces of a programme: class years, Kalakriti editions, drives and corporate engagements.",
    group: "organization",
    icon: FolderLibraryIcon,
    label: "Projects",
    path: "/settings/projects",
    permission: "finance.manage",
  },
  {
    description:
      "Where the work happens, shown to volunteers as City: picked on events and on requests without an event, and listed on the public events feed by code.",
    group: "organization",
    icon: Location01Icon,
    label: "Cost centres",
    path: "/settings/cost-centres",
    permission: "finance.manage",
  },
  {
    description:
      "The bank, cash and gateway accounts income is deposited into, and the 80G registration the donations return carries.",
    group: "organization",
    icon: Wallet01Icon,
    label: "Organisation accounts",
    path: "/settings/org-accounts",
    permission: "finance.view",
  },
  {
    description:
      "Funds income is recorded into, unrestricted or restricted, domestic or FCRA.",
    group: "organization",
    icon: PiggyBankIcon,
    label: "Funds",
    path: "/settings/funds",
    permission: "finance.manage",
  },
  {
    description:
      "The heads the books post income, expenses, assets, liabilities and funds under.",
    group: "organization",
    icon: Book02Icon,
    label: "Account heads",
    path: "/settings/account-heads",
    permission: "finance.manage",
  },
  {
    description:
      "Payment gateways that record donations automatically, starting with Razorpay.",
    group: "organization",
    icon: PlugSocketIcon,
    label: "Integrations",
    path: "/settings/integrations",
    permission: "finance.view",
  },
  {
    description: "Categories people pick for each expense line.",
    group: "organization",
    icon: Tag01Icon,
    label: "Expense categories",
    path: "/settings/expense-categories",
    permission: "settings.expense_categories",
  },
  {
    description: "Groups messages are sent to, and where volunteers are added.",
    group: "organization",
    icon: SmartPhone01Icon,
    label: "WhatsApp groups",
    path: "/settings/whatsapp-groups",
    permission: "settings.whatsapp_groups",
  },
  {
    description:
      "Tokens for the social API. Only a hash is stored, so a token is shown once.",
    group: "organization",
    icon: Key01Icon,
    label: "API tokens",
    path: "/settings/api-tokens",
    permission: "settings.app_config",
  },
  {
    description:
      "Run background jobs by hand. Results appear on the Jobs page.",
    group: "organization",
    icon: ToolsIcon,
    label: "Maintenance",
    path: "/settings/maintenance",
    permission: "jobs.manage",
  },
] as const satisfies readonly SettingsSection[];

export type SettingsPath = (typeof SETTINGS_SECTIONS)[number]["path"];

export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  organization: "Organization",
  you: "You",
};

export function getSettingsSection(path: SettingsPath): SettingsSection {
  const section = SETTINGS_SECTIONS.find((item) => item.path === path);
  if (!section) {
    throw new Error(`Unknown settings section ${path}`);
  }
  return section;
}

/** The sections this person may open, in nav order. */
export function visibleSettingsSections(
  hasPermission: (permission: PermissionId) => boolean
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section: SettingsSection) =>
      !section.permission || hasPermission(section.permission)
  );
}
