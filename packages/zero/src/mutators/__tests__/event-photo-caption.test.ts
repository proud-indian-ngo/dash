import { describe, expect, it, mock } from "bun:test";

import { eventPhotoMutators } from "../event-photo";

type Row = Record<string, unknown>;

function createTx(photo: Row, isLead = false) {
  const update = mock(async (_row: Row) => undefined);
  const tx = {
    location: "server",
    mutate: { eventPhoto: { update } },
    run: mock()
      .mockResolvedValueOnce(photo)
      .mockResolvedValueOnce({ managementDomain: null, teamId: "team-1" })
      .mockResolvedValueOnce(isLead ? { id: "tm-1" } : undefined),
  };
  return { tx, update };
}

const photo = (extra: Row = {}): Row => ({
  eventId: "event-1",
  id: "photo-1",
  status: "pending",
  uploadedBy: "volunteer-1",
  ...extra,
});

const volunteer = { permissions: [], role: "volunteer", userId: "volunteer-1" };

describe("event photo captions", () => {
  it("lets the uploader caption their pending photo", async () => {
    const { tx, update } = createTx(photo());
    await eventPhotoMutators.setCaption.fn({
      args: { caption: "Art class", id: "photo-1" },
      ctx: volunteer,
      tx,
    } as never);
    expect(update).toHaveBeenCalledWith({
      caption: "Art class",
      id: "photo-1",
    });
  });

  it("clears the caption when it is empty", async () => {
    const { tx, update } = createTx(photo());
    await eventPhotoMutators.setCaption.fn({
      args: { caption: "", id: "photo-1" },
      ctx: volunteer,
      tx,
    } as never);
    expect(update).toHaveBeenCalledWith({ caption: null, id: "photo-1" });
  });

  it("refuses the uploader once the photo is approved", async () => {
    const { tx, update } = createTx(photo({ status: "approved" }));
    await expect(
      eventPhotoMutators.setCaption.fn({
        args: { caption: "Art class", id: "photo-1" },
        ctx: volunteer,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses another volunteer's pending photo", async () => {
    const { tx } = createTx(photo({ uploadedBy: "someone-else" }));
    await expect(
      eventPhotoMutators.setCaption.fn({
        args: { caption: "Art class", id: "photo-1" },
        ctx: volunteer,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
  });

  it("lets a lead or events.manage_photos caption any photo", async () => {
    const asLead = createTx(photo({ status: "approved" }), true);
    await eventPhotoMutators.setCaption.fn({
      args: { caption: "Art class", id: "photo-1" },
      ctx: { permissions: [], role: "volunteer", userId: "lead-1" },
      tx: asLead.tx,
    } as never);
    expect(asLead.update).toHaveBeenCalled();

    const asAdmin = createTx(photo({ status: "approved" }));
    await eventPhotoMutators.setCaption.fn({
      args: { caption: "Art class", id: "photo-1" },
      ctx: {
        permissions: ["events.manage_photos"],
        role: "admin",
        userId: "admin-1",
      },
      tx: asAdmin.tx,
    } as never);
    expect(asAdmin.update).toHaveBeenCalled();
  });
});
