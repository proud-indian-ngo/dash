import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  kalakritiAssignment,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { kalakritiInventoryItem } from "@pi-dash/db/schema/kalakriti-inventory";
import { KALAKRITI_INVENTORY_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti-inventory";
import { and, eq, inArray } from "drizzle-orm";

import { PrivateMediaAccessError } from "@/lib/private-media-access";

interface SessionUser {
  id: string;
  role?: null | string;
}

export interface KalakritiInventoryPhotoRecord {
  editionId: string;
  filename: string;
  key: string;
}

export async function canAccessKalakritiInventoryPhoto(
  user: SessionUser,
  editionId: string,
  write = false
): Promise<boolean> {
  const edition = await db.query.kalakritiEdition.findFirst({
    columns: { lifecycle: true },
    where: eq(kalakritiEdition.id, editionId),
  });
  if (!edition || (write && edition.lifecycle === "archived")) return false;

  const permissions = await resolvePermissions(
    user.role ?? "unoriented_volunteer"
  );
  if (permissions.includes("kalakriti.admin")) return true;
  if (!permissions.includes("kalakriti.view")) return false;
  if (edition.lifecycle === "archived") return false;

  const membership = await db.query.kalakritiEditionMembership.findFirst({
    columns: { id: true, kind: true },
    where: and(
      eq(kalakritiEditionMembership.editionId, editionId),
      eq(kalakritiEditionMembership.userId, user.id),
      eq(kalakritiEditionMembership.state, "active")
    ),
  });
  if (membership?.kind !== "volunteer") return false;

  const assignment = await db.query.kalakritiAssignment.findFirst({
    columns: { id: true },
    where: and(
      eq(kalakritiAssignment.editionId, editionId),
      eq(kalakritiAssignment.membershipId, membership.id),
      inArray(
        kalakritiAssignment.responsibility,
        KALAKRITI_INVENTORY_RESPONSIBILITIES
      )
    ),
  });
  return !!assignment;
}

export async function authorizeKalakritiInventoryPhotoUpload({
  editionId,
  user,
}: {
  editionId: string;
  user: SessionUser;
}): Promise<void> {
  if (!(await canAccessKalakritiInventoryPhoto(user, editionId, true))) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
}

export async function loadKalakritiInventoryPhotoRecord(
  itemId: string
): Promise<KalakritiInventoryPhotoRecord | null> {
  const [item] = await db
    .select({
      editionId: kalakritiInventoryItem.editionId,
      photoKey: kalakritiInventoryItem.photoKey,
      photoName: kalakritiInventoryItem.photoName,
    })
    .from(kalakritiInventoryItem)
    .where(eq(kalakritiInventoryItem.id, itemId))
    .limit(1);
  return item?.photoKey
    ? {
        editionId: item.editionId,
        filename: item.photoName ?? "inventory-photo",
        key: item.photoKey,
      }
    : null;
}
