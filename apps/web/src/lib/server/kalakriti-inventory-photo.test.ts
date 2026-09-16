import { beforeEach, describe, expect, it, mock } from "bun:test";

const tables = {
  kalakritiAssignment: { findFirst: mock() },
  kalakritiEdition: { findFirst: mock() },
  kalakritiEditionMembership: { findFirst: mock() },
};
const limitInventoryItems = mock();
const selectInventoryItem = mock(() => ({
  from: () => ({ where: () => ({ limit: limitInventoryItems }) }),
}));
const resolvePermissions = mock();
mock.module("@pi-dash/db", () => ({
  db: { query: tables, select: selectInventoryItem },
}));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));

import {
  authorizeKalakritiInventoryPhotoUpload,
  canAccessKalakritiInventoryPhoto,
  loadKalakritiInventoryPhotoRecord,
} from "./kalakriti-inventory-photo";

const user = { id: "logistics-user", role: "volunteer" };
const editionId = "edition";

beforeEach(() => {
  for (const table of Object.values(tables)) table.findFirst.mockReset();
  limitInventoryItems.mockReset();
  selectInventoryItem.mockClear();
  resolvePermissions.mockReset();
  resolvePermissions.mockResolvedValue(["kalakriti.view"]);
  tables.kalakritiEdition.findFirst.mockResolvedValue({ lifecycle: "live" });
  tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
    id: "membership",
    kind: "volunteer",
  });
  tables.kalakritiAssignment.findFirst.mockResolvedValue({ id: "assignment" });
});

describe("Kalakriti inventory photo access", () => {
  it("allows active logistics staff to sign uploads and read photos", async () => {
    await expect(
      authorizeKalakritiInventoryPhotoUpload({ editionId, user })
    ).resolves.toBeUndefined();
    expect(await canAccessKalakritiInventoryPhoto(user, editionId)).toBe(true);
    expect(tables.kalakritiAssignment.findFirst).toHaveBeenCalledTimes(2);
  });

  it("denies revoked memberships and missing assignments", async () => {
    tables.kalakritiEditionMembership.findFirst.mockResolvedValue(null);
    expect(await canAccessKalakritiInventoryPhoto(user, editionId)).toBe(false);
    tables.kalakritiEditionMembership.findFirst.mockResolvedValue({
      id: "membership",
      kind: "volunteer",
    });
    tables.kalakritiAssignment.findFirst.mockResolvedValue(null);
    await expect(
      authorizeKalakritiInventoryPhotoUpload({ editionId, user })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("denies photo access after the global view permission is revoked", async () => {
    resolvePermissions.mockResolvedValue([]);
    expect(await canAccessKalakritiInventoryPhoto(user, editionId)).toBe(false);
    await expect(
      authorizeKalakritiInventoryPhotoUpload({ editionId, user })
    ).rejects.toMatchObject({ status: 403 });
    expect(tables.kalakritiEditionMembership.findFirst).not.toHaveBeenCalled();
  });

  it("makes archived photos global-admin read-only", async () => {
    tables.kalakritiEdition.findFirst.mockResolvedValue({
      lifecycle: "archived",
    });
    expect(await canAccessKalakritiInventoryPhoto(user, editionId)).toBe(false);
    resolvePermissions.mockResolvedValue(["kalakriti.admin"]);
    expect(await canAccessKalakritiInventoryPhoto(user, editionId)).toBe(true);
    expect(await canAccessKalakritiInventoryPhoto(user, editionId, true)).toBe(
      false
    );
  });

  it("loads only the current persisted key by item ID", async () => {
    limitInventoryItems.mockResolvedValue([
      {
        editionId,
        photoKey: "app/kalakriti-inventory/edition/item/photo.png",
        photoName: "photo.png",
      },
    ]);
    expect(await loadKalakritiInventoryPhotoRecord("item")).toEqual({
      editionId,
      filename: "photo.png",
      key: "app/kalakriti-inventory/edition/item/photo.png",
    });
    expect(selectInventoryItem).toHaveBeenCalledTimes(1);
    expect(limitInventoryItems).toHaveBeenCalledWith(1);
    limitInventoryItems.mockResolvedValue([{ photoKey: null }]);
    expect(await loadKalakritiInventoryPhotoRecord("item")).toBeNull();
  });
});
