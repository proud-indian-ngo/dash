import { useApp } from "@/context/app-context";
import { getUserHoverDetails } from "@/functions/user-hover-details";
import { type ContactState, useContacts } from "@/hooks/use-contacts";

const fetchUserContact = async (userId: string) => {
  const details = await getUserHoverDetails({ data: { userId } });
  return details
    ? { [userId]: { email: details.email, phone: details.phone } }
    : {};
};

/**
 * Someone else's contact for a `users.view` holder, as the hover card shows
 * it, for places a touch device cannot hover such as a request's page menu.
 */
export function useUserContact(userId: string | undefined): ContactState {
  const { hasPermission, user } = useApp();
  const allowed =
    userId !== undefined && userId !== user.id && hasPermission("users.view");
  const { contactFor } = useContacts(
    fetchUserContact,
    userId ?? "",
    allowed ? [userId] : []
  );
  return allowed ? contactFor(userId) : undefined;
}
