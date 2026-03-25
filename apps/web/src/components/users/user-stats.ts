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
      label: "Total Users",
      value: users.length,
      icon: UserMultipleIcon,
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
    },
    {
      label: "Active",
      value: active.length,
      icon: UserCheck01Icon,
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
    },
    {
      label: "Inactive",
      value: inactive.length,
      icon: UserRemove01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
    },
    {
      label: "Needs Orientation",
      value: needsOrientation.length,
      icon: Mortarboard02Icon,
      accent: "border-l-violet-500",
      bgAccent: "bg-violet-500/5 dark:bg-violet-500/10",
    },
  ];
}
