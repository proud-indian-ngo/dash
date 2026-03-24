import type { User } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import { SHORT_DATE } from "@/lib/date-formats";

export const searchUser = (user: User, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const dobText = user.dob == null ? "" : format(user.dob, SHORT_DATE);

  return [
    user.name,
    user.email,
    user.phone ?? "",
    user.gender ?? "",
    dobText,
    user.banReason ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
};
