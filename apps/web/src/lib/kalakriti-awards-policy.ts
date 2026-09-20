import { canManageKalakritiAwards } from "@pi-dash/shared/kalakriti-awards";

interface AwardsAccess {
  edition: { lifecycle: string };
  isGlobalAdmin: boolean;
  membership: {
    assignments: readonly { responsibility: string }[];
    kind: string;
    state?: string;
  } | null;
}

export function canViewKalakritiAwards(
  access: AwardsAccess | null | undefined
): boolean {
  if (!access) return false;
  return (
    canManageKalakritiAwards(access) &&
    (access.edition.lifecycle !== "archived" || access.isGlobalAdmin)
  );
}
