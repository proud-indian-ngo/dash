import {
  AnalyticsUpIcon,
  Book02Icon,
  FavouriteIcon,
  Award01Icon,
  Audit01Icon,
  Building03Icon,
  Bus01Icon,
  DashboardCircleIcon,
  IdentityCardIcon,
  JusticeScale01Icon,
  Megaphone01Icon,
  PaintBoardIcon,
  PiggyBankIcon,
  Restaurant01Icon,
  StudentIcon,
  TransactionIcon,
  TrophyIcon,
  UserLove01Icon,
  UserShield01Icon,
  Calendar03Icon,
  Calendar04Icon,
  Certificate01Icon,
  Files01Icon,
  LegalDocument01Icon,
  MeetingRoomIcon,
  Shield01Icon,
  UserCheck01Icon,
  UserMultiple02Icon,
  FileExportIcon,
  HomeIcon,
  Invoice01Icon,
  Message01Icon,
  MessageNotification01Icon,
  MoneyReceive01Icon,
  SecurityLockIcon,
  Settings01Icon,
  Store01Icon,
  TaskDaily02Icon,
  TaskDone01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import {
  GOVERNANCE_PAGE_PERMISSIONS,
  REGISTRATIONS_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import { BOOKS_PAGE_PERMISSIONS } from "@pi-dash/shared/ledger";

import type { NavItem } from "@/components/layout/nav-main";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

export type { NavItem } from "@/components/layout/nav-main";

export interface NavGroup {
  items: NavItem[];
  label?: string;
}

const homeNavItem: NavItem = {
  icon: HomeIcon,
  shortTitle: "Home",
  title: "Dashboard",
  url: "/",
};

const usersNavItem: NavItem = {
  icon: UserIcon,
  title: "Users",
  url: "/users",
};

const exportNavItem: NavItem = {
  icon: FileExportIcon,
  title: "Export",
  url: "/export",
};

const rolesNavItem: NavItem = {
  icon: SecurityLockIcon,
  subItems: [
    { isHidden: true, title: "Edit role", url: "/settings/roles/$roleId" },
  ],
  title: "Roles",
  url: "/settings/roles",
};

// Breadcrumbs only: settings lives in the account menu, not the sidebar.
const settingsNavItem: NavItem = {
  icon: Settings01Icon,
  subItems: SETTINGS_SECTIONS.map((section) => ({
    isHidden: true,
    title: section.label,
    url: section.path,
  })),
  title: "Settings",
  url: "/settings",
};

const reimbursementsNavItem: NavItem = {
  icon: Invoice01Icon,
  subItems: [
    { isHidden: true, title: "New reimbursement", url: "/reimbursements/new" },
    {
      isHidden: true,
      title: "Reimbursement Details",
      url: "/reimbursements/$id",
    },
  ],
  shortTitle: "Claims",
  title: "Reimbursements",
  url: "/reimbursements",
};

const vendorPaymentsNavItem: NavItem = {
  icon: TransactionIcon,
  subItems: [
    {
      isHidden: true,
      title: "New vendor payment",
      url: "/vendor-payments/new",
    },
    {
      isHidden: true,
      title: "Vendor Payment Details",
      url: "/vendor-payments/$id",
    },
  ],
  title: "Vendor Payments",
  url: "/vendor-payments",
};

const vendorsNavItem: NavItem = {
  icon: Store01Icon,
  title: "Vendors",
  url: "/vendors",
};

const donorsNavItem: NavItem = {
  icon: FavouriteIcon,
  title: "Donors",
  url: "/donors",
};

const incomeNavItem: NavItem = {
  icon: MoneyReceive01Icon,
  title: "Income",
  url: "/income",
};

const trusteeRegisterNavItem: NavItem = {
  icon: UserMultiple02Icon,
  title: "Trustee register",
  url: "/governance",
};

const resolutionsNavItem: NavItem = {
  icon: TaskDone01Icon,
  subItems: [
    {
      isHidden: true,
      title: "Resolution",
      url: "/governance/resolutions/$resolutionId",
    },
    {
      isHidden: true,
      title: "Signing helper",
      url: "/governance/resolutions/signing-helper",
    },
  ],
  title: "Resolutions",
  url: "/governance/resolutions",
};

const meetingsNavItem: NavItem = {
  icon: MeetingRoomIcon,
  subItems: [
    {
      isHidden: true,
      title: "Meeting",
      url: "/governance/meetings/$meetingId",
    },
  ],
  title: "Meetings",
  url: "/governance/meetings",
};

const declarationsNavItem: NavItem = {
  icon: UserCheck01Icon,
  title: "Declarations",
  url: "/governance/declarations",
};

const policiesNavItem: NavItem = {
  icon: Shield01Icon,
  title: "Policies",
  url: "/governance/policies",
};

const complianceNavItem: NavItem = {
  icon: Calendar04Icon,
  title: "Compliance",
  url: "/governance/compliance",
};

const governanceDocumentsNavItem: NavItem = {
  icon: Files01Icon,
  title: "Documents",
  url: "/governance/documents",
};

const registrationsNavItem: NavItem = {
  icon: Certificate01Icon,
  title: "Registrations",
  url: "/governance/registrations",
};

const deedNavItem: NavItem = {
  icon: LegalDocument01Icon,
  title: "Trust deed",
  url: "/governance/deed",
};

/** Register, vault and deed for governance; registrations for finance too. */
function governanceNavItems(permissions: string[]): NavItem[] {
  const items: NavItem[] = [];
  if (hasAny(permissions, ...GOVERNANCE_PAGE_PERMISSIONS)) {
    items.push(
      trusteeRegisterNavItem,
      resolutionsNavItem,
      meetingsNavItem,
      complianceNavItem,
      declarationsNavItem,
      policiesNavItem,
      governanceDocumentsNavItem
    );
  }
  if (hasAny(permissions, ...REGISTRATIONS_PAGE_PERMISSIONS)) {
    items.push(registrationsNavItem);
  }
  if (hasAny(permissions, ...GOVERNANCE_PAGE_PERMISSIONS)) {
    items.push(deedNavItem);
  }
  return items;
}

const booksNavItem: NavItem = {
  icon: Book02Icon,
  subItems: [
    {
      isHidden: true,
      title: "Opening balances",
      url: "/finance/books/opening",
    },
    {
      isHidden: true,
      title: "Audited figures",
      url: "/finance/books/audited",
    },
  ],
  title: "Books",
  url: "/finance/books",
};

const budgetsNavItem: NavItem = {
  icon: PiggyBankIcon,
  title: "Budgets",
  url: "/finance/budgets",
};

const teamsNavItem: NavItem = {
  icon: UserGroupIcon,
  subItems: [{ isHidden: true, title: "Team Details", url: "/teams/$id" }],
  title: "Teams",
  url: "/teams",
};

const analyticsNavItem: NavItem = {
  icon: AnalyticsUpIcon,
  title: "Analytics",
  url: "/analytics",
};

const jobsNavItem: NavItem = {
  icon: TaskDaily02Icon,
  title: "Jobs",
  url: "/jobs",
};

const notificationDeliveryNavItem: NavItem = {
  icon: MessageNotification01Icon,
  title: "Notification delivery",
  url: "/notification-delivery",
};

const auditLogNavItem: NavItem = {
  icon: Audit01Icon,
  title: "Audit Log",
  url: "/audit-log",
};

const scheduledMessagesNavItem: NavItem = {
  icon: Message01Icon,
  title: "Messages",
  url: "/scheduled-messages",
};

const eventsNavItem: NavItem = {
  icon: Calendar03Icon,
  subItems: [{ isHidden: true, title: "Event Details", url: "/events/$id" }],
  title: "Events",
  url: "/events",
};

const socialNavItem: NavItem = {
  icon: Megaphone01Icon,
  title: "Social",
  url: "/social",
};

const kalakritiNavItem: NavItem = {
  icon: PaintBoardIcon,
  subItems: [
    { isHidden: true, title: "Edition", url: "/kalakriti/$year" },
    { isHidden: true, title: "New Edition", url: "/kalakriti/new" },
  ],
  title: "Kalakriti",
  url: "/kalakriti",
};

export function buildKalakritiNavGroups({
  canManageEligibility = false,
  canViewGuardians = false,
  canViewVolunteers = false,
  canViewAudit = false,
  canViewCompetitions = false,
  canViewEntries = false,
  canViewStudents = false,
  canViewFood = false,
  canViewTransport = false,
  canViewInventory = false,
  canViewGuests = false,
  canViewJudges = false,
  canViewAwards = false,
  year,
}: {
  canManageEligibility?: boolean;
  canViewGuardians?: boolean;
  canViewVolunteers?: boolean;
  canViewAudit?: boolean;
  canViewCompetitions?: boolean;
  canViewEntries?: boolean;
  canViewStudents?: boolean;
  canViewFood?: boolean;
  canViewTransport?: boolean;
  canViewInventory?: boolean;
  canViewGuests?: boolean;
  canViewJudges?: boolean;
  canViewAwards?: boolean;
  year?: number;
} = {}): NavGroup[] {
  const editionItems: NavItem[] = [
    {
      icon: DashboardCircleIcon,
      title: year ? "Overview" : "Edition",
      url: year ? `/kalakriti/${year}` : "/kalakriti",
    },
  ];

  if (year) {
    editionItems.push({
      icon: Building03Icon,
      title: "Centers",
      url: `/kalakriti/${year}/centers`,
    });
  }

  if (year && canViewVolunteers) {
    editionItems.push({
      icon: UserLove01Icon,
      title: "Volunteers",
      url: `/kalakriti/${year}/volunteers`,
    });
  }

  if (year && canViewStudents) {
    editionItems.push({
      icon: StudentIcon,
      title: "Students",
      url: `/kalakriti/${year}/students`,
    });
  }

  if (year && (canViewCompetitions || canViewEntries)) {
    editionItems.push({
      icon: TrophyIcon,
      title: "Competitions",
      url: `/kalakriti/${year}/competitions`,
    });
  }

  if (year && canViewAwards) {
    editionItems.push({
      icon: Award01Icon,
      title: "Awards",
      url: `/kalakriti/${year}/awards`,
    });
  }

  if (year && (canViewCompetitions || canManageEligibility)) {
    editionItems.push({
      icon: Settings01Icon,
      title: "Settings",
      url: `/kalakriti/${year}/settings`,
    });
  }

  if (year && canViewGuardians) {
    editionItems.push({
      icon: UserShield01Icon,
      title: "Guardians",
      url: `/kalakriti/${year}/guardians`,
    });
  }

  if (year && canViewGuests) {
    editionItems.push({
      icon: IdentityCardIcon,
      title: "Guests",
      url: `/kalakriti/${year}/guests`,
    });
  }
  if (year && canViewJudges) {
    editionItems.push({
      icon: JusticeScale01Icon,
      title: "Judges",
      url: `/kalakriti/${year}/judges`,
    });
  }

  if (year && canViewTransport) {
    editionItems.push({
      icon: Bus01Icon,
      title: "Transport",
      url: `/kalakriti/${year}/transport`,
    });
  }

  if (year && canViewInventory) {
    editionItems.push({
      icon: Building03Icon,
      title: "Inventory",
      url: `/kalakriti/${year}/inventory`,
    });
  }

  if (year && canViewFood) {
    editionItems.push({
      icon: Restaurant01Icon,
      title: "Food",
      url: `/kalakriti/${year}/food`,
    });
  }

  if (year && canViewAudit) {
    editionItems.push({
      icon: Audit01Icon,
      title: "Audit",
      url: `/kalakriti/${year}/audit`,
    });
  }

  return [
    { items: [homeNavItem] },
    { items: editionItems, label: "Kalakriti" },
  ];
}

export function withKalakritiNavItem(groups: NavGroup[]): NavGroup[] {
  if (
    groups.some((group) =>
      group.items.some((item) => item.title === "Kalakriti")
    )
  ) {
    return groups;
  }
  const organizationIndex = groups.findIndex(
    (group) => group.label === "Organization"
  );
  if (organizationIndex === -1) {
    return [...groups, { items: [kalakritiNavItem], label: "Organization" }];
  }
  return groups.map((group, index) =>
    index === organizationIndex
      ? { ...group, items: [...group.items, kalakritiNavItem] }
      : group
  );
}

export function isKalakritiPath(pathname: string): boolean {
  return pathname === "/kalakriti" || pathname.startsWith("/kalakriti/");
}

export function shouldUseKalakritiNav(
  pathname: string,
  role?: string | null
): boolean {
  return role === "external_user" || isKalakritiPath(pathname);
}

function has(permissions: string[], id: string): boolean {
  return permissions.includes(id);
}

function hasAny(permissions: string[], ...ids: string[]): boolean {
  return ids.some((id) => permissions.includes(id));
}

/** Build flat nav item list based purely on user permissions. */
export function buildNavItems(permissions: string[] = []): NavItem[] {
  const items: NavItem[] = [homeNavItem];

  if (hasAny(permissions, "events.view_own", "events.view_all")) {
    items.push(eventsNavItem);
  }
  if (has(permissions, "social.manage")) {
    items.push(socialNavItem);
  }
  if (has(permissions, "kalakriti.view")) {
    items.push(kalakritiNavItem);
  }
  if (hasAny(permissions, "requests.view_own", "requests.view_all")) {
    items.push(reimbursementsNavItem);
    items.push(vendorPaymentsNavItem);
  }
  if (hasAny(permissions, "teams.view_own", "teams.view_all")) {
    items.push(teamsNavItem);
  }
  if (has(permissions, "vendors.view_all")) {
    items.push(vendorsNavItem);
  }
  if (has(permissions, "donors.view")) {
    items.push(donorsNavItem);
  }
  if (hasAny(permissions, ...INCOME_PERMISSIONS)) {
    items.push(incomeNavItem);
  }
  if (hasAny(permissions, ...BOOKS_PAGE_PERMISSIONS)) {
    items.push(booksNavItem);
  }
  if (has(permissions, "finance.view")) {
    items.push(budgetsNavItem);
  }
  items.push(...governanceNavItems(permissions));
  if (has(permissions, "users.manage")) {
    items.push(usersNavItem);
  }
  if (has(permissions, "requests.view_all")) {
    items.push(analyticsNavItem);
  }
  if (has(permissions, "requests.export")) {
    items.push(exportNavItem);
  }
  if (has(permissions, "settings.roles")) {
    items.push(rolesNavItem);
  }
  items.push(settingsNavItem);
  if (has(permissions, "jobs.manage")) {
    items.push(jobsNavItem);
  }
  if (has(permissions, "notifications.view_delivery")) {
    items.push(notificationDeliveryNavItem);
  }
  if (has(permissions, "audit_log.view")) {
    items.push(auditLogNavItem);
  }
  if (has(permissions, "messages.schedule")) {
    items.push(scheduledMessagesNavItem);
  }

  return items;
}

/** Build grouped nav based purely on user permissions. */
export function buildNavGroups(permissions: string[] = []): NavGroup[] {
  const groups: NavGroup[] = [{ items: [homeNavItem] }];

  // Events — visible to everyone with events.view_own (including unoriented)
  const hasEvents = hasAny(permissions, "events.view_own", "events.view_all");

  // Finance group
  const hasRequests = hasAny(
    permissions,
    "requests.view_own",
    "requests.view_all"
  );
  const hasVendors = permissions.includes("vendors.view_all");
  const financeItems: NavItem[] = [];
  if (hasRequests) {
    financeItems.push(reimbursementsNavItem);
    financeItems.push(vendorPaymentsNavItem);
  }
  if (hasVendors) {
    financeItems.push(vendorsNavItem);
  }
  if (has(permissions, "donors.view")) {
    financeItems.push(donorsNavItem);
  }
  if (hasAny(permissions, ...INCOME_PERMISSIONS)) {
    financeItems.push(incomeNavItem);
  }
  if (hasAny(permissions, ...BOOKS_PAGE_PERMISSIONS)) {
    financeItems.push(booksNavItem);
  }
  if (has(permissions, "finance.view")) {
    financeItems.push(budgetsNavItem);
  }
  if (financeItems.length > 0) {
    groups.push({ items: financeItems, label: "Finance" });
  }

  // Organization group
  const hasTeams = hasAny(permissions, "teams.view_own", "teams.view_all");
  const orgItems: NavItem[] = [];
  if (hasTeams) {
    orgItems.push(teamsNavItem);
  }
  if (hasEvents) {
    orgItems.push(eventsNavItem);
  }
  if (has(permissions, "social.manage")) {
    orgItems.push(socialNavItem);
  }
  if (has(permissions, "kalakriti.view")) {
    orgItems.push(kalakritiNavItem);
  }
  if (orgItems.length > 0) {
    groups.push({ items: orgItems, label: "Organization" });
  }

  const governanceItems = governanceNavItems(permissions);
  if (governanceItems.length > 0) {
    groups.push({ items: governanceItems, label: "Governance" });
  }

  // Admin group
  const adminItems: NavItem[] = [];
  if (has(permissions, "requests.view_all")) {
    adminItems.push(analyticsNavItem);
  }
  if (has(permissions, "users.manage")) {
    adminItems.push(usersNavItem);
  }
  if (has(permissions, "requests.export")) {
    adminItems.push(exportNavItem);
  }
  if (has(permissions, "jobs.manage")) {
    adminItems.push(jobsNavItem);
  }
  if (has(permissions, "notifications.view_delivery")) {
    adminItems.push(notificationDeliveryNavItem);
  }
  if (has(permissions, "audit_log.view")) {
    adminItems.push(auditLogNavItem);
  }
  if (has(permissions, "messages.schedule")) {
    adminItems.push(scheduledMessagesNavItem);
  }
  // Settings sits in the account menu for everyone; people who can open an
  // Organization section also get it here, opening on the first of those.
  const firstOrgSection = SETTINGS_SECTIONS.find(
    (section) =>
      section.group === "organization" && has(permissions, section.permission)
  );
  if (firstOrgSection) {
    adminItems.push({
      icon: Settings01Icon,
      matchPath: "/settings",
      title: "Settings",
      url: firstOrgSection.path,
    });
  }
  if (adminItems.length > 0) {
    groups.push({ items: adminItems, label: "Admin" });
  }

  return groups;
}
