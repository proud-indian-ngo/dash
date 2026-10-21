import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

import { authClient } from "@/lib/auth-client";

/**
 * Whether the signed-in person leads a programme, and so approves its
 * requests before finance ("Approval policy"). Unallocated has no lead step.
 */
export function useLeadsAProgramme(): boolean {
  const { data: session } = authClient.useSession();
  const [programmes] = useQuery(queries.programme.all());
  const userId = session?.user?.id;
  return programmes.some(
    (programme) =>
      programme.leadUserId === userId &&
      programme.id !== PROGRAMME_IDS.unallocated
  );
}
