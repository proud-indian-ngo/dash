import {
  Calendar03Icon,
  FileExportIcon,
  HomeIcon,
  Invoice01Icon,
  MoneySendSquareIcon,
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

const advancePaymentsNavItem: NavItem = {
  title: "Advance Payments",
  url: "/advance-payments",
  icon: MoneySendSquareIcon,
  subItems: [
    {
      title: "New Advance Payment",
      url: "/advance-payments/new",
      isHidden: true,
    },
    {
      title: "Advance Payment Details",
      url: "/advance-payments/$id",
      isHidden: true,
    },
  ],
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
  isAdmin: boolean,
  isOriented: boolean
): NavItem[] {
  if (!isOriented) {
    return [homeNavItem, eventsNavItem];
  }

  const items = [
    homeNavItem,
    reimbursementsNavItem,
    advancePaymentsNavItem,
    teamsNavItem,
    eventsNavItem,
  ];

  if (isAdmin) {
    items.push(usersNavItem);
    items.push(exportNavItem);
  }

  return items;
}

export function buildNavGroups(
  isAdmin: boolean,
  isOriented: boolean
): NavGroup[] {
  if (!isOriented) {
    return [{ items: [homeNavItem, eventsNavItem] }];
  }

  const groups: NavGroup[] = [
    { items: [homeNavItem] },
    {
      label: "Finance",
      items: [reimbursementsNavItem, advancePaymentsNavItem],
    },
    {
      label: "Organization",
      items: [teamsNavItem, eventsNavItem],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Admin",
      items: [usersNavItem, exportNavItem],
    });
  }

  return groups;
}
