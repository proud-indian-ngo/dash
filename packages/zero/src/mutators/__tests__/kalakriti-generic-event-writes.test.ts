import { describe, expect, it, vi } from "vitest";
import { eventImmichAlbumMutators } from "../event-immich-album";
import { eventPhotoMutators } from "../event-photo";
import { eventUpdateMutators } from "../event-update";

const context = {
  permissions: ["event_updates.create", "events.manage_photos"],
  role: "admin",
  userId: "admin-1",
};

describe("Kalakriti generic event write protection", () => {
  it("rejects an event update before inserting it", async () => {
    const insert = vi.fn();
    const results = [
      {
        id: "event-1",
        name: "Kalakriti",
        startTime: 1_600_000_000_000,
        teamId: "team-1",
      },
      { id: "event-1", managementDomain: "kalakriti" },
    ];
    const tx = {
      location: "server",
      mutate: { eventUpdate: { insert } },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      eventUpdateMutators.create.fn({
        args: {
          content: "Update",
          eventId: "event-1",
          id: "update-1",
          now: 1_700_000_000_000,
        },
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Manage this event from Kalakriti");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects photo deletion before deleting it", async () => {
    const deletePhoto = vi.fn();
    const results = [
      {
        eventId: "event-1",
        id: "photo-1",
        status: "approved",
        uploadedBy: "volunteer-1",
      },
      { id: "event-1", teamId: "team-1" },
      { id: "event-1", managementDomain: "kalakriti" },
    ];
    const tx = {
      location: "server",
      mutate: { eventPhoto: { delete: deletePhoto } },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      eventPhotoMutators.delete.fn({
        args: { id: "photo-1" },
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Manage this event from Kalakriti");
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it("rejects album deletion before deleting its photos or album", async () => {
    const deleteAlbum = vi.fn();
    const deletePhoto = vi.fn();
    const results = [
      { eventId: "event-1", id: "album-1", immichAlbumId: "immich-1" },
      { id: "event-1", teamId: "team-1" },
      { id: "event-1", managementDomain: "kalakriti" },
    ];
    const tx = {
      location: "server",
      mutate: {
        eventImmichAlbum: { delete: deleteAlbum },
        eventPhoto: { delete: deletePhoto },
      },
      run: vi.fn(async () => results.shift()),
    };

    await expect(
      eventImmichAlbumMutators.deleteAlbum.fn({
        args: { eventId: "event-1" },
        ctx: context,
        tx,
      } as never)
    ).rejects.toThrow("Manage this event from Kalakriti");
    expect(deletePhoto).not.toHaveBeenCalled();
    expect(deleteAlbum).not.toHaveBeenCalled();
  });
});
