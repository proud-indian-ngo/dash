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
import { authClient } from "@/lib/auth-client";

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

export const useNavItems = () => {
  const { data: session } = authClient.useSession();

  if (!session?.user) {
    return [];
  }

  const items = [
    homeNavItem,
    reimbursementsNavItem,
    advancePaymentsNavItem,
    teamsNavItem,
    eventsNavItem,
  ];

  if (session.user.role === "admin") {
    items.push(usersNavItem);
    items.push(exportNavItem);
  }

  return items;
};
