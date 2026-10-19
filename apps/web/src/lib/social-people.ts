import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { listSocialPeople } from "@pi-dash/db/queries/social-api";

import { HttpError } from "@/lib/http-error";

/** Permissions that may read Social page names (`users.view` sees users anyway). */
export const SOCIAL_PEOPLE_PERMISSIONS = ["social.manage", "users.view"];

export interface SocialPeopleDeps {
  listSocialPeople: typeof listSocialPeople;
  resolvePermissions: (role: string) => Promise<string[]>;
}

/**
 * Ids and names only: the digest approver candidates and the names of the
 * given users and of everyone who dropped a post.
 */
export async function loadSocialPeople(
  session: { user: { id: string; role?: string | null } } | null | undefined,
  ids: readonly string[],
  deps: SocialPeopleDeps = { listSocialPeople, resolvePermissions }
) {
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  const permissions = await deps.resolvePermissions(
    session.user.role ?? "unoriented_volunteer"
  );
  if (!SOCIAL_PEOPLE_PERMISSIONS.some((id) => permissions.includes(id))) {
    throw new HttpError(403, "Forbidden");
  }
  return await deps.listSocialPeople(ids);
}
