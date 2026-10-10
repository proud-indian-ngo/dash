import {
  Mortarboard02Icon,
  UserCheck01Icon,
  UserMultipleIcon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";

import type { StatItem } from "@/components/stats/stats-cards";

interface UserLike {
  banned: boolean | null;
  isActive: boolean | null;
  role: string | null;
}

export function computeUserStats(users: readonly UserLike[]): StatItem[] {
  const active = users.filter((u) => u.isActive && !u.banned);
  const inactive = users.filter((u) => !u.isActive || u.banned);
  const needsOrientation = users.filter(
    (u) => u.role === "unoriented_volunteer"
  );

  return [
    {
      icon: UserMultipleIcon,
      label: "Total Users",
      value: users.length,
    },
    {
      icon: UserCheck01Icon,
      label: "Active",
      value: active.length,
    },
    {
      icon: UserRemove01Icon,
      label: "Inactive",
      value: inactive.length,
    },
    {
      icon: Mortarboard02Icon,
      label: "Needs Orientation",
      value: needsOrientation.length,
    },
  ];
}
