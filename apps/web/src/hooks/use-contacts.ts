import { log } from "evlog";
import { useEffect, useState } from "react";

import type { Contact } from "@/functions/contacts";

/** One person's contact as a list shows it: known, still loading, or failed. */
export type ContactState = Contact | "failed" | "loading" | undefined;

type FetchContacts = (scopeId: string) => Promise<Record<string, Contact>>;

/**
 * Contact details for the given people on one team, event or record. Fetches
 * again only when someone appears who was not in an earlier request, not on
 * every list change; people the server left out stay unresolved without a
 * refetch. Pass no ids to skip fetching, for viewers who may not see contacts.
 * `fetchContacts` must be stable, such as a module-level function.
 */
export function useContacts(
  fetchContacts: FetchContacts,
  scopeId: string,
  userIds: readonly string[]
) {
  const [contacts, setContacts] = useState<{
    byUser: Record<string, Contact | null>;
    scopeId: string;
  }>({ byUser: {}, scopeId });
  const [settled, setSettled] = useState<null | {
    failed: boolean;
    key: string;
  }>(null);
  const known = contacts.scopeId === scopeId ? contacts.byUser : {};
  const missingKey = userIds.filter((id) => !(id in known)).join(",");
  const requestKey = `${scopeId}:${missingKey}`;

  useEffect(() => {
    if (!missingKey) {
      return;
    }
    let current = true;
    const key = `${scopeId}:${missingKey}`;
    fetchContacts(scopeId)
      .then((byUser) => {
        if (!current) {
          return;
        }
        // Everyone asked about is now resolved, found or not.
        const resolved: Record<string, Contact | null> = {};
        for (const id of missingKey.split(",")) {
          resolved[id] = null;
        }
        setContacts((previous) => ({
          byUser: {
            ...(previous.scopeId === scopeId ? previous.byUser : {}),
            ...resolved,
            ...byUser,
          },
          scopeId,
        }));
        setSettled({ failed: false, key });
      })
      .catch((error: unknown) => {
        log.error({
          action: "fetchContacts",
          component: "useContacts",
          entityId: scopeId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (current) {
          setSettled({ failed: true, key });
        }
      });
    return () => {
      current = false;
    };
  }, [fetchContacts, missingKey, scopeId]);

  const settledNow = settled?.key === requestKey;
  const loading = missingKey !== "" && !settledNow;
  const failed = missingKey !== "" && settledNow && Boolean(settled?.failed);

  function contactFor(userId: string): ContactState {
    const contact = known[userId];
    if (contact !== undefined) {
      return contact ?? undefined;
    }
    if (loading) {
      return "loading";
    }
    return failed ? "failed" : undefined;
  }

  return { contactFor };
}
