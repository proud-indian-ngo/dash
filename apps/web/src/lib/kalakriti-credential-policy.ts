import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export function canManageKalakritiCredentials(
  access: KalakritiEditionAccess | null | undefined
): boolean {
  if (!access) {
    return false;
  }
  return (
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true
  );
}
