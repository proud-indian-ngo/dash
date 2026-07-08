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
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
      icon: UserMultipleIcon,
      label: "Total Users",
      value: users.length,
    },
    {
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: UserCheck01Icon,
      label: "Active",
      value: active.length,
    },
    {
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
      icon: UserRemove01Icon,
      label: "Inactive",
      value: inactive.length,
    },
    {
      accent: "border-l-violet-500",
      bgAccent: "bg-violet-500/5 dark:bg-violet-500/10",
      icon: Mortarboard02Icon,
      label: "Needs Orientation",
      value: needsOrientation.length,
    },
  ];
}
