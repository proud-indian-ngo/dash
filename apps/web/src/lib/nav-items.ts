import {
  Calendar03Icon,
  FileExportIcon,
  HomeIcon,
  Invoice01Icon,
  Store01Icon,
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

const requestsNavItem: NavItem = {
  title: "Requests",
  url: "/requests",
  icon: Invoice01Icon,
  subItems: [
    { title: "New Request", url: "/requests/new", isHidden: true },
    {
      title: "Request Details",
      url: "/requests/$id",
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

const eventsNavItem: NavItem = {
  title: "Events",
  url: "/events",
  icon: Calendar03Icon,
  subItems: [{ title: "Event Details", url: "/events/$id", isHidden: true }],
};

export function buildNavItems(
  _isAdmin: boolean,
  isOriented: boolean,
  permissions: string[] = []
): NavItem[] {
  if (!isOriented) {
    return [homeNavItem, eventsNavItem];
  }

  const items = [homeNavItem, requestsNavItem, teamsNavItem, eventsNavItem];

  const hasVendors =
    permissions.includes("vendors.view_all") ||
    permissions.includes("vendors.view_approved");
  const hasUsers = permissions.includes("users.view");
  const hasExport = permissions.includes("requests.export");

  if (hasVendors) {
    items.push(vendorsNavItem);
  }
  if (hasUsers) {
    items.push(usersNavItem);
  }
  if (hasExport) {
    items.push(exportNavItem);
  }

  return items;
}

export function buildNavGroups(
  _isAdmin: boolean,
  isOriented: boolean,
  permissions: string[] = []
): NavGroup[] {
  if (!isOriented) {
    return [{ items: [homeNavItem, eventsNavItem] }];
  }

  const hasVendors =
    permissions.includes("vendors.view_all") ||
    permissions.includes("vendors.view_approved");
  const hasUsers = permissions.includes("users.view");
  const hasExport = permissions.includes("requests.export");

  const financeItems = [requestsNavItem];
  if (hasVendors) {
    financeItems.push(vendorsNavItem);
  }

  const groups: NavGroup[] = [
    { items: [homeNavItem] },
    {
      label: "Finance",
      items: financeItems,
    },
    {
      label: "Organization",
      items: [teamsNavItem, eventsNavItem],
    },
  ];

  const adminItems: NavItem[] = [];
  if (hasUsers) {
    adminItems.push(usersNavItem);
  }
  if (hasExport) {
    adminItems.push(exportNavItem);
  }

  if (adminItems.length > 0) {
    groups.push({
      label: "Admin",
      items: adminItems,
    });
  }

  return groups;
}
