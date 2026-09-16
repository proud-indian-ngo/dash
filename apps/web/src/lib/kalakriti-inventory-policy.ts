import { KALAKRITI_INVENTORY_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti-inventory";

interface InventoryAccess {
  isGlobalAdmin: boolean;
  edition?: { lifecycle: string };
  membership: {
    kind: string;
    assignments: readonly { responsibility: string }[];
  } | null;
}

export function canViewKalakritiInventory(
  access: InventoryAccess | null | undefined
): boolean {
  if (!access) return false;
  if (access.isGlobalAdmin) return true;
  if (access.edition?.lifecycle === "archived") return false;
  return (
    access.membership?.kind === "volunteer" &&
    access.membership.assignments.some((assignment) =>
      (KALAKRITI_INVENTORY_RESPONSIBILITIES as readonly string[]).includes(
        assignment.responsibility
      )
    )
  );
}

export function canManageKalakritiInventory(
  access: InventoryAccess | null | undefined
): boolean {
  return (
    Boolean(access) &&
    access?.edition?.lifecycle !== "archived" &&
    canViewKalakritiInventory(access)
  );
}
