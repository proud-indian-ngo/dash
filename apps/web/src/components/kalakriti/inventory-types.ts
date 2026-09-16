import type {
  KalakritiCompetition,
  KalakritiEditionMembership,
  KalakritiInventoryItem,
  KalakritiInventoryTransaction,
  User,
} from "@pi-dash/zero/schema";

export type InventoryItem = KalakritiInventoryItem;

export type InventoryTransaction = KalakritiInventoryTransaction & {
  item?: Pick<KalakritiInventoryItem, "id" | "name">;
  volunteer?: Pick<KalakritiEditionMembership, "id" | "snapshotName"> & {
    user?: Pick<User, "name">;
  };
  competition?: Pick<KalakritiCompetition, "id" | "name">;
  actor?: Pick<User, "id" | "name">;
};
