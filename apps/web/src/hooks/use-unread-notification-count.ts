import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

export function useUnreadNotificationCount() {
  const [notifications] = useQuery(queries.notification.forCurrentUser());
  return notifications.filter((n) => !n.read).length;
}
