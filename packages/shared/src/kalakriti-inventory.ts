export const KALAKRITI_INVENTORY_TYPES = [
  "initial_inventory",
  "purchase",
  "dispatch",
  "return",
  "adjustment",
] as const;

export type KalakritiInventoryType = (typeof KALAKRITI_INVENTORY_TYPES)[number];

export const KALAKRITI_INVENTORY_LABELS: Record<
  KalakritiInventoryType,
  string
> = {
  initial_inventory: "Opening stock",
  purchase: "Purchase",
  dispatch: "Dispatch",
  return: "Return",
  adjustment: "Adjustment",
};

export const KALAKRITI_INVENTORY_RESPONSIBILITIES = [
  "edition_admin",
  "logistics_lead",
  "logistics_member",
] as const;

export const MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
