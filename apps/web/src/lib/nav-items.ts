import {
  AnalyticsUpIcon,
  Calendar03Icon,
  FileExportIcon,
  HomeIcon,
  Invoice01Icon,
  Message01Icon,
  SecurityLockIcon,
  Store01Icon,
  TaskDaily02Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";

import type { NavItem } from "@/components/layout/nav-main";

export type { NavItem } from "@/components/layout/nav-main";

export interface NavGroup {
  items: NavItem[];
  label?: string;
}

const homeNavItem: NavItem = {
  icon: HomeIcon,
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
    { isHidden: true, title: "Edit Role", url: "/settings/roles/$roleId" },
  ],
  title: "Roles",
  url: "/settings/roles",
};

const reimbursementsNavItem: NavItem = {
  icon: Invoice01Icon,
  subItems: [
    { isHidden: true, title: "New Reimbursement", url: "/reimbursements/new" },
    {
      isHidden: true,
      title: "Reimbursement Details",
      url: "/reimbursements/$id",
    },
  ],
  title: "Reimbursements",
  url: "/reimbursements",
};

const vendorPaymentsNavItem: NavItem = {
  icon: Store01Icon,
  subItems: [
    {
      isHidden: true,
      title: "New Vendor Payment",
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
  if (has(permissions, "jobs.manage")) {
    items.push(jobsNavItem);
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
  if (orgItems.length > 0) {
    groups.push({ items: orgItems, label: "Organization" });
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
  if (has(permissions, "settings.roles")) {
    adminItems.push(rolesNavItem);
  }
  if (has(permissions, "jobs.manage")) {
    adminItems.push(jobsNavItem);
  }
  if (has(permissions, "messages.schedule")) {
    adminItems.push(scheduledMessagesNavItem);
  }
  if (adminItems.length > 0) {
    groups.push({ items: adminItems, label: "Admin" });
  }

  return groups;
}
