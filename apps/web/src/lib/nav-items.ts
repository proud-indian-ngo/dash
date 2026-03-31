import {
  Calendar03Icon,
  FileExportIcon,
  HomeIcon,
  Invoice01Icon,
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
  title: "Dashboard",
  url: "/",
  icon: HomeIcon,
};

const usersNavItem: NavItem = {
  title: "Users",
  url: "/users",
  icon: UserIcon,
};

const exportNavItem: NavItem = {
  title: "Export",
  url: "/export",
  icon: FileExportIcon,
};

const rolesNavItem: NavItem = {
  title: "Roles",
  url: "/settings/roles",
  icon: SecurityLockIcon,
  subItems: [
    { title: "Edit Role", url: "/settings/roles/$roleId", isHidden: true },
  ],
};

const reimbursementsNavItem: NavItem = {
  title: "Reimbursements",
  url: "/reimbursements",
  icon: Invoice01Icon,
  subItems: [
    { title: "New Reimbursement", url: "/reimbursements/new", isHidden: true },
    {
      title: "Reimbursement Details",
      url: "/reimbursements/$id",
      isHidden: true,
    },
  ],
};

const vendorPaymentsNavItem: NavItem = {
  title: "Vendor Payments",
  url: "/vendor-payments",
  icon: Store01Icon,
  subItems: [
    {
      title: "New Vendor Payment",
      url: "/vendor-payments/new",
      isHidden: true,
    },
    {
      title: "Vendor Payment Details",
      url: "/vendor-payments/$id",
      isHidden: true,
    },
  ],
};

const vendorsNavItem: NavItem = {
  title: "Vendors",
  url: "/vendors",
  icon: Store01Icon,
};

const teamsNavItem: NavItem = {
  title: "Teams",
  url: "/teams",
  icon: UserGroupIcon,
  subItems: [{ title: "Team Details", url: "/teams/$id", isHidden: true }],
};

const jobsNavItem: NavItem = {
  title: "Jobs",
  url: "/jobs",
  icon: TaskDaily02Icon,
};

const eventsNavItem: NavItem = {
  title: "Events",
  url: "/events",
  icon: Calendar03Icon,
  subItems: [{ title: "Event Details", url: "/events/$id", isHidden: true }],
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
  if (has(permissions, "users.view")) {
    items.push(usersNavItem);
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
    groups.push({ label: "Finance", items: financeItems });
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
    groups.push({ label: "Organization", items: orgItems });
  }

  // Admin group
  const adminItems: NavItem[] = [];
  if (has(permissions, "users.view")) {
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
  if (adminItems.length > 0) {
    groups.push({ label: "Admin", items: adminItems });
  }

  return groups;
}
