import { log } from "evlog";
import { useEffect, useState } from "react";

import type { EventContact } from "@/functions/event-contacts";

type FetchContacts = (options: {
  data: { eventId: string };
}) => Promise<Record<string, EventContact>>;

const NON_DIGITS = /\D/g;

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(NON_DIGITS, "")}`;
}

/**
 * Contact details for the given people on an event. Fetches again only when
 * someone appears who was not in an earlier request, not on every list
 * change; people the server left out stay unresolved without a refetch.
 * Pass no ids to skip fetching, for viewers who may not see contacts.
 */
export function useEventContacts(
  fetchContacts: FetchContacts,
  eventId: string,
  userIds: readonly string[]
) {
  const [contacts, setContacts] = useState<{
    byUser: Record<string, EventContact | null>;
    eventId: string;
  }>({ byUser: {}, eventId });
  const [settled, setSettled] = useState<null | {
    failed: boolean;
    key: string;
  }>(null);
  const known = contacts.eventId === eventId ? contacts.byUser : {};
  const missingKey = userIds.filter((id) => !(id in known)).join(",");
  const requestKey = `${eventId}:${missingKey}`;

  useEffect(() => {
    if (!missingKey) {
      return;
    }
    let current = true;
    const key = `${eventId}:${missingKey}`;
    fetchContacts({ data: { eventId } })
      .then((byUser) => {
        if (!current) {
          return;
        }
        // Everyone asked about is now resolved, found or not.
        const resolved: Record<string, EventContact | null> = {};
        for (const id of missingKey.split(",")) {
          resolved[id] = null;
        }
        setContacts((previous) => ({
          byUser: {
            ...(previous.eventId === eventId ? previous.byUser : {}),
            ...resolved,
            ...byUser,
          },
          eventId,
        }));
        setSettled({ failed: false, key });
      })
      .catch((error: unknown) => {
        log.error({
          action: "fetchEventContacts",
          component: "useEventContacts",
          entityId: eventId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (current) {
          setSettled({ failed: true, key });
        }
      });
    return () => {
      current = false;
    };
  }, [eventId, fetchContacts, missingKey]);

  const settledNow = settled?.key === requestKey;
  return {
    contacts: known,
    failed: missingKey !== "" && settledNow && Boolean(settled?.failed),
    loading: missingKey !== "" && !settledNow,
  };
}
