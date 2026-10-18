import { format } from "date-fns";

import type { AdminUser } from "@/functions/user-admin-reads";
import { DATE } from "@/lib/date-formats";

export const searchUser = (user: AdminUser, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const dobText = user.dob === null ? "" : format(user.dob, DATE);

  return [
    user.name,
    user.email,
    user.phone ?? "",
    user.registrationGroup ?? "",
    user.gender ?? "",
    dobText,
    user.banReason ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
};
