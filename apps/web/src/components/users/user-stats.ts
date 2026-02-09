import {
  UserCheck01Icon,
  UserIcon,
  UserMultipleIcon,
  UserShield01Icon,
} from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";

interface UserLike {
  banned: boolean | null;
  isActive: boolean | null;
  role: string | null;
}

export function computeUserStats(users: readonly UserLike[]): StatItem[] {
  const active = users.filter((u) => u.isActive && !u.banned);
  const admins = users.filter((u) => u.role === "admin");
  const volunteers = users.filter((u) => u.role === "volunteer");

  return [
    {
      label: "Total Users",
      value: users.length,
      icon: UserMultipleIcon,
      accent: "border-l-blue-500",
    },
    {
      label: "Active",
      value: active.length,
      icon: UserCheck01Icon,
      accent: "border-l-emerald-500",
    },
    {
      label: "Admins",
      value: admins.length,
      icon: UserShield01Icon,
      accent: "border-l-violet-500",
    },
    {
      label: "Volunteers",
      value: volunteers.length,
      icon: UserIcon,
      accent: "border-l-sky-500",
    },
  ];
}
