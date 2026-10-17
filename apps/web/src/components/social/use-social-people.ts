import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { getSocialPeople } from "@/functions/social-people";
import { getErrorMessage } from "@/lib/errors";

interface Person {
  id: string;
  name: string;
}

export interface SocialPeople {
  /** Active, unbanned users: the digest approver options. */
  candidates: Person[];
  /** Names by id for the given users, droppers and candidates. */
  names: ReadonlyMap<string, string>;
}

const MAX_IDS = 20;

/** Merge the server's lists into one name lookup. */
export function buildSocialPeople(data: {
  candidates: Person[];
  named: Person[];
}): SocialPeople {
  return {
    candidates: data.candidates,
    names: new Map(
      [...data.candidates, ...data.named].map((person) => [
        person.id,
        person.name,
      ])
    ),
  };
}

/**
 * Ids and names for the Social page, without syncing user rows; refetched
 * when the set of `ids` changes (a new approver or a new dropper).
 */
export function useSocialPeople(ids: readonly (string | null | undefined)[]) {
  const load = useServerFn(getSocialPeople);
  const unique = [
    ...new Set(ids.filter((id): id is string => Boolean(id))),
  ].sort();
  const key = unique.slice(0, MAX_IDS).join(",");
  const [people, setPeople] = useState<SocialPeople | null>(null);

  const refresh = useEventCallback(async (requested: string) => {
    const requestedIds = requested ? requested.split(",") : [];
    try {
      const data = await load({ data: { ids: requestedIds } });
      setPeople(buildSocialPeople(data));
    } catch (error) {
      log.error({
        action: "getSocialPeople",
        component: "useSocialPeople",
        error: getErrorMessage(error),
      });
    }
  });

  useEffect(() => {
    refresh(key);
  }, [key, refresh]);

  return people;
}
