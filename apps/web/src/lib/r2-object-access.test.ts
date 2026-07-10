import { describe, expect, it } from "vitest";
import {
  authorizeR2Object,
  type R2ObjectAccessDeps,
  R2ObjectAccessError,
} from "./r2-object-access";

const ownerSession = { user: { id: "owner", role: "volunteer" } };

const deps = (
  overrides: Partial<R2ObjectAccessDeps> = {}
): R2ObjectAccessDeps => ({
  isEventMember: async () => false,
  isTeamLead: async () => false,
  isTeamMember: async () => false,
  resolvePermissions: async () => [],
  ...overrides,
});

describe("authorizeR2Object", () => {
  it("allows an owner to read an exact legacy request attachment key", async () => {
    await expect(
      authorizeR2Object(
        ownerSession,
        {
          access: "request",
          filename: "receipt.pdf",
          key: "legacy/uploads/receipt.pdf",
          ownerUserIds: ["owner"],
        },
        deps()
      )
    ).resolves.toEqual({
      filename: "receipt.pdf",
      key: "legacy/uploads/receipt.pdf",
    });
  });

  it("allows requests.view_all to read another user's request object", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "manager", role: "manager" } },
        {
          access: "request",
          filename: "receipt.pdf",
          key: "app/attachments/receipt.pdf",
          ownerUserIds: ["owner"],
        },
        deps({
          resolvePermissions: async () => ["requests.view_all"],
        })
      )
    ).resolves.toMatchObject({ key: "app/attachments/receipt.pdf" });
  });

  it("rejects an unrelated request viewer", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "other", role: "volunteer" } },
        {
          access: "request",
          filename: "receipt.pdf",
          key: "app/attachments/receipt.pdf",
          ownerUserIds: ["owner"],
        },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an exact DB record that still points at a temporary key", async () => {
    await expect(
      authorizeR2Object(
        ownerSession,
        {
          access: "request",
          filename: "receipt.pdf",
          key: "app/attachments/tmp/owner/receipt.pdf",
          ownerUserIds: ["owner"],
        },
        deps()
      )
    ).rejects.toEqual(new R2ObjectAccessError(404, "Object not found"));
  });

  it("allows a scheduled-message creator to read its exact attachment", async () => {
    await expect(
      authorizeR2Object(
        ownerSession,
        {
          access: "scheduledMessage",
          createdBy: "owner",
          filename: "agenda.pdf",
          key: "legacy/messages/agenda.pdf",
        },
        deps()
      )
    ).resolves.toMatchObject({ key: "legacy/messages/agenda.pdf" });
  });

  it("rejects an unrelated scheduled-message viewer", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "other", role: "volunteer" } },
        {
          access: "scheduledMessage",
          createdBy: "owner",
          filename: "agenda.pdf",
          key: "legacy/messages/agenda.pdf",
        },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows a scheduled-message manager to read another creator's attachment", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "manager", role: "manager" } },
        {
          access: "scheduledMessage",
          createdBy: "owner",
          filename: "agenda.pdf",
          key: "legacy/messages/agenda.pdf",
        },
        deps({ resolvePermissions: async () => ["messages.schedule"] })
      )
    ).resolves.toMatchObject({ key: "legacy/messages/agenda.pdf" });
  });

  it("allows an authenticated user to read an approved public event photo", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "viewer", role: "volunteer" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: true,
          filename: "photo.jpg",
          key: "legacy/photos/photo.jpg",
          status: "approved",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps()
      )
    ).resolves.toMatchObject({ key: "legacy/photos/photo.jpg" });
  });

  it("allows an uploader to read their own pending event photo", async () => {
    await expect(
      authorizeR2Object(
        ownerSession,
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "pending",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps()
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });

  it("allows an event member to read an approved private event photo", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "member", role: "volunteer" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "approved",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps({ isEventMember: async () => true })
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });

  it("rejects an unrelated viewer of an approved private event photo", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "other", role: "volunteer" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "approved",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows a photo manager to read a private event photo in any status", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "manager", role: "manager" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "rejected",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps({ resolvePermissions: async () => ["events.manage_photos"] })
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });

  it("allows a team lead to read a private event photo in any status", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "lead", role: "volunteer" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "pending",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps({ isTeamLead: async () => true })
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });

  it("allows a team member to read an approved private event photo", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "team-member", role: "volunteer" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "approved",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps({ isTeamMember: async () => true })
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });

  it("allows an events.view_all user to read an event photo in any status", async () => {
    await expect(
      authorizeR2Object(
        { user: { id: "manager", role: "manager" } },
        {
          access: "eventPhoto",
          eventId: "event-1",
          eventIsPublic: false,
          filename: "photo.jpg",
          key: "app/photos/photo.jpg",
          status: "rejected",
          teamId: "team-1",
          uploadedBy: "owner",
        },
        deps({ resolvePermissions: async () => ["events.view_all"] })
      )
    ).resolves.toMatchObject({ key: "app/photos/photo.jpg" });
  });
});
