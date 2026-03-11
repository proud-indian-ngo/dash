import {
  Calendar03Icon,
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

const reimbursementsNavItem: NavItem = {
  title: "Reimbursements",
  url: "/reimbursements",
  icon: Invoice01Icon,
};

const advancePaymentsNavItem: NavItem = {
  title: "Advance Payments",
  url: "/advance-payments",
  icon: MoneySendSquareIcon,
};

const teamsNavItem: NavItem = {
  title: "Teams",
  url: "/teams",
  icon: UserGroupIcon,
};

const eventsNavItem: NavItem = {
  title: "Events",
  url: "/events",
  icon: Calendar03Icon,
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
  }

  return items;
};
