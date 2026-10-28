import type { AdminUser } from "@/functions/user-admin-reads";

export const searchUser = (user: AdminUser, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return [
    user.name,
    user.email,
    user.phone ?? "",
    user.registrationGroup ?? "",
    user.gender ?? "",
    user.banReason ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
};
