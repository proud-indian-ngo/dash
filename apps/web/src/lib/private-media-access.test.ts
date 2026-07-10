import { describe, expect, it } from "vitest";
import {
  authorizeEventEditorUpload,
  authorizeProtectedUpload,
  type PrivateMediaAccessDeps,
  PrivateMediaAccessError,
  resolveAvatarMedia,
  resolveEventUpdateMedia,
} from "./private-media-access";

const EVENT_ID = "e2e00000-0000-0000-0000-000000000101";
const KEY = `app/updates/${EVENT_ID}/photo.jpg`;
const LEGACY_CDN_URL = "https://cdn.example.test";

const deps = (
  overrides: Partial<PrivateMediaAccessDeps> = {}
): PrivateMediaAccessDeps => ({
  findEvent: async () => ({ isPublic: false, teamId: "team-1" }),
  findUserImage: async () => null,
  findVendorPaymentOwner: async () => null,
  getEventMediaRecords: async () => [
    {
      content: JSON.stringify([
        {
          children: [{ text: "" }],
          type: "img",
          url: `https://cdn.example.test/${KEY}`,
        },
      ]),
      createdBy: "author",
      kind: "eventUpdate",
      status: "approved",
    },
  ],
  isEventMember: async () => false,
  isTeamLead: async () => false,
  isTeamMember: async () => false,
  keyPrefix: "app",
  legacyCdnUrl: LEGACY_CDN_URL,
  resolvePermissions: async () => [],
  ...overrides,
});

describe("resolveEventUpdateMedia", () => {
  it("allows a team member to read an exact persisted image key", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "member", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        deps({ isTeamMember: async () => true })
      )
    ).resolves.toEqual({ key: KEY });
  });

  it("allows events.view_all to read an exact persisted image key", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "admin", role: "admin" } },
        { eventId: EVENT_ID, key: KEY },
        deps({ resolvePermissions: async () => ["events.view_all"] })
      )
    ).resolves.toEqual({ key: KEY });
  });

  it("rejects a visible event key that is not persisted in that event", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "member", role: "volunteer" } },
        { eventId: EVENT_ID, key: `${KEY}-other` },
        deps({ isTeamMember: async () => true })
      )
    ).rejects.toEqual(new PrivateMediaAccessError(404, "Media not found"));
  });

  it("rejects a plain authenticated user for a private event", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "other", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects temporary keys even when referenced", async () => {
    const temporaryKey = "app/updates/tmp/member/photo.jpg";
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "member", role: "volunteer" } },
        { eventId: EVENT_ID, key: temporaryKey },
        deps({
          getEventMediaRecords: async () => [
            {
              content: JSON.stringify([
                {
                  children: [{ text: "" }],
                  type: "img",
                  url: `https://cdn.example.test/${temporaryKey}`,
                },
              ]),
              createdBy: "member",
              kind: "eventUpdate",
              status: "approved",
            },
          ],
          isTeamMember: async () => true,
        })
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ignores over-deep content without breaking valid media reads", async () => {
    let nested: unknown = {
      children: [{ text: "" }],
      type: "img",
      url: `https://cdn.example.test/${KEY}`,
    };
    for (let depth = 0; depth < 150; depth += 1) {
      nested = [nested];
    }

    await expect(
      resolveEventUpdateMedia(
        { user: { id: "member", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        deps({
          getEventMediaRecords: async () => [
            {
              content: JSON.stringify([nested]),
              createdBy: "member",
              kind: "eventUpdate",
              status: "pending",
            },
            {
              content: JSON.stringify([
                {
                  children: [{ text: "" }],
                  type: "img",
                  url: `https://cdn.example.test/${KEY}`,
                },
              ]),
              createdBy: "author",
              kind: "eventUpdate",
              status: "approved",
            },
          ],
          isTeamMember: async () => true,
        })
      )
    ).resolves.toEqual({ key: KEY });
  });

  it("allows a pending update author but hides it from another event member", async () => {
    const pendingDeps = deps({
      getEventMediaRecords: async () => [
        {
          content: JSON.stringify([
            {
              children: [{ text: "" }],
              type: "img",
              url: `https://cdn.example.test/${KEY}`,
            },
          ]),
          createdBy: "author",
          kind: "eventUpdate",
          status: "pending",
        },
      ],
      isTeamMember: async () => true,
    });

    await expect(
      resolveEventUpdateMedia(
        { user: { id: "author", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        pendingDeps
      )
    ).resolves.toEqual({ key: KEY });
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "other", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        pendingDeps
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it("allows a global update approver without private-event membership", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "approver", role: "approver" } },
        { eventId: EVENT_ID, key: KEY },
        deps({
          getEventMediaRecords: async () => [
            {
              content: JSON.stringify([
                {
                  children: [{ text: "" }],
                  type: "img",
                  url: `https://cdn.example.test/${KEY}`,
                },
              ]),
              createdBy: "author",
              kind: "eventUpdate",
              status: "pending",
            },
          ],
          resolvePermissions: async () => ["event_updates.approve"],
        })
      )
    ).resolves.toEqual({ key: KEY });
  });

  it("allows feedback media only to its submitter or a feedback manager", async () => {
    const feedbackDeps = deps({
      getEventMediaRecords: async () => [
        {
          content: JSON.stringify([
            {
              children: [{ text: "" }],
              type: "img",
              url: `https://cdn.example.test/${KEY}`,
            },
          ]),
          kind: "eventFeedback",
          submitterIds: ["submitter"],
        },
      ],
      isTeamMember: async () => true,
    });

    await expect(
      resolveEventUpdateMedia(
        { user: { id: "submitter", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        feedbackDeps
      )
    ).resolves.toEqual({ key: KEY });
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "other", role: "volunteer" } },
        { eventId: EVENT_ID, key: KEY },
        feedbackDeps
      )
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "manager", role: "manager" } },
        { eventId: EVENT_ID, key: KEY },
        deps({
          ...feedbackDeps,
          isTeamMember: async () => true,
          resolvePermissions: async () => ["events.manage_feedback"],
        })
      )
    ).resolves.toEqual({ key: KEY });
  });

  it("allows a feedback manager without private-event membership", async () => {
    await expect(
      resolveEventUpdateMedia(
        { user: { id: "manager", role: "manager" } },
        { eventId: EVENT_ID, key: KEY },
        deps({
          getEventMediaRecords: async () => [
            {
              content: JSON.stringify([
                {
                  children: [{ text: "" }],
                  type: "img",
                  url: `https://cdn.example.test/${KEY}`,
                },
              ]),
              kind: "eventFeedback",
              submitterIds: ["submitter"],
            },
          ],
          resolvePermissions: async () => ["events.manage_feedback"],
        })
      )
    ).resolves.toEqual({ key: KEY });
  });
});

describe("authorizeEventEditorUpload", () => {
  it("allows event_updates.create", async () => {
    await expect(
      authorizeEventEditorUpload(
        { user: { id: "admin", role: "admin" } },
        EVENT_ID,
        deps({ resolvePermissions: async () => ["event_updates.create"] })
      )
    ).resolves.toEqual({ isPublic: false, teamId: "team-1" });
  });

  it("allows the event team lead", async () => {
    await expect(
      authorizeEventEditorUpload(
        { user: { id: "lead", role: "volunteer" } },
        EVENT_ID,
        deps({ isTeamLead: async () => true })
      )
    ).resolves.toMatchObject({ teamId: "team-1" });
  });

  it("rejects plain event membership", async () => {
    await expect(
      authorizeEventEditorUpload(
        { user: { id: "member", role: "volunteer" } },
        EVENT_ID,
        deps({ isEventMember: async () => true })
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("authorizeProtectedUpload", () => {
  it("allows request writers and rejects unrelated roles", async () => {
    await expect(
      authorizeProtectedUpload(
        { user: { id: "author", role: "volunteer" } },
        { kind: "request" },
        deps({ resolvePermissions: async () => ["requests.edit_own"] })
      )
    ).resolves.toBeUndefined();
    await expect(
      authorizeProtectedUpload(
        { user: { id: "other", role: "volunteer" } },
        { kind: "request" },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("requires approval and scheduled-message permissions", async () => {
    await expect(
      authorizeProtectedUpload(
        { user: { id: "approver", role: "admin" } },
        { kind: "approvalScreenshot" },
        deps({ resolvePermissions: async () => ["requests.approve"] })
      )
    ).resolves.toBeUndefined();
    await expect(
      authorizeProtectedUpload(
        { user: { id: "scheduler", role: "admin" } },
        { kind: "scheduledMessage" },
        deps({ resolvePermissions: async () => ["messages.schedule"] })
      )
    ).resolves.toBeUndefined();
  });

  it("allows event photo managers, team leads, and event members", async () => {
    const scope = { eventId: EVENT_ID, kind: "eventPhoto" } as const;

    await expect(
      authorizeProtectedUpload(
        { user: { id: "manager", role: "admin" } },
        scope,
        deps({ resolvePermissions: async () => ["events.manage_photos"] })
      )
    ).resolves.toBeUndefined();
    await expect(
      authorizeProtectedUpload(
        { user: { id: "lead", role: "volunteer" } },
        scope,
        deps({ isTeamLead: async () => true })
      )
    ).resolves.toBeUndefined();
    await expect(
      authorizeProtectedUpload(
        { user: { id: "member", role: "volunteer" } },
        scope,
        deps({ isEventMember: async () => true })
      )
    ).resolves.toBeUndefined();
  });

  it("rejects event photo uploads without event access", async () => {
    await expect(
      authorizeProtectedUpload(
        { user: { id: "other", role: "volunteer" } },
        { eventId: EVENT_ID, kind: "eventPhoto" },
        deps()
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows vendor-payment invoice uploads for the owner and approvers", async () => {
    const scope = {
      kind: "vendorPaymentInvoice",
      vendorPaymentId: "vendor-payment-1",
    } as const;

    await expect(
      authorizeProtectedUpload(
        { user: { id: "owner", role: "volunteer" } },
        scope,
        deps({ findVendorPaymentOwner: async () => "owner" })
      )
    ).resolves.toBeUndefined();
    await expect(
      authorizeProtectedUpload(
        { user: { id: "approver", role: "admin" } },
        scope,
        deps({
          findVendorPaymentOwner: async () => "owner",
          resolvePermissions: async () => ["requests.approve"],
        })
      )
    ).resolves.toBeUndefined();
  });

  it("rejects unrelated and missing vendor-payment invoice scopes", async () => {
    const scope = {
      kind: "vendorPaymentInvoice",
      vendorPaymentId: "vendor-payment-1",
    } as const;

    await expect(
      authorizeProtectedUpload(
        { user: { id: "other", role: "volunteer" } },
        scope,
        deps({ findVendorPaymentOwner: async () => "owner" })
      )
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeProtectedUpload(
        { user: { id: "approver", role: "admin" } },
        scope,
        deps({ resolvePermissions: async () => ["requests.approve"] })
      )
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("resolveAvatarMedia", () => {
  it("resolves a canonical avatar URL only for its stored key", async () => {
    const key = "app/avatars/user-1/avatar.jpg";
    await expect(
      resolveAvatarMedia(
        { key, userId: "user-1" },
        deps({
          findUserImage: async () =>
            `/api/media/avatar/user-1?key=${encodeURIComponent(key)}`,
        })
      )
    ).resolves.toEqual({ key });
  });

  it("supports a stored legacy CDN avatar URL", async () => {
    const key = "app/avatars/user-1/avatar.jpg";
    await expect(
      resolveAvatarMedia(
        { key, userId: "user-1" },
        deps({
          findUserImage: async () => `https://cdn.example.test/${key}`,
        })
      )
    ).resolves.toEqual({ key });
  });

  it("rejects a requested key that differs from the stored avatar", async () => {
    await expect(
      resolveAvatarMedia(
        { key: "app/avatars/user-1/other.jpg", userId: "user-1" },
        deps({
          findUserImage: async () =>
            "https://cdn.example.test/app/avatars/user-1/avatar.jpg",
        })
      )
    ).rejects.toMatchObject({ status: 404 });
  });
});
