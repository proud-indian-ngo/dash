import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import { env } from "@pi-dash/env/server";
import {
  type AuthorizedR2ObjectDeps,
  assertCanDeleteTemporaryUpload,
  assertCanDownloadR2Object,
  assertCanUploadEventScopedObject,
  assertCanUploadScheduledMessageObject,
  R2ObjectAccessError,
} from "./authorized-r2-object";

const ownerSession = { user: { id: "owner", role: "volunteer" } };
const managerSession = { user: { id: "manager", role: "manager" } };
const otherSession = { user: { id: "other", role: "volunteer" } };

function createDeps(
  overrides: Partial<AuthorizedR2ObjectDeps> = {}
): AuthorizedR2ObjectDeps {
  return {
    findAdvancePaymentApprovalScreenshot: async () => null,
    findAdvancePaymentAttachment: async () => null,
    findEvent: async () => null,
    findEventPhoto: async () => null,
    findReimbursementApprovalScreenshot: async () => null,
    findReimbursementAttachment: async () => null,
    findScheduledMessage: async () => null,
    findVendorPaymentAttachment: async () => null,
    findVendorPaymentTransactionAttachment: async () => null,
    isEventMember: async () => false,
    isTeamLead: async () => false,
    resolvePermissions: async () => [],
    ...overrides,
  };
}

describe("authorized R2 object resolver", () => {
  it("allows owner to resolve reimbursement attachment", async () => {
    const deps = createDeps({
      findReimbursementAttachment: async () => ({
        filename: "receipt.pdf",
        objectKey: "app/attachments/reimbursement/receipt.pdf",
        ownerUserId: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        ownerSession,
        { id: "attachment-id", kind: "reimbursementAttachment" },
        deps
      )
    ).resolves.toEqual({
      filename: "receipt.pdf",
      key: "app/attachments/reimbursement/receipt.pdf",
    });
  });

  it("allows requests.view_all user to resolve reimbursement attachment", async () => {
    const deps = createDeps({
      findReimbursementAttachment: async () => ({
        filename: "receipt.pdf",
        objectKey: "app/attachments/reimbursement/receipt.pdf",
        ownerUserId: "owner",
      }),
      resolvePermissions: async (role) =>
        role === "manager" ? ["requests.view_all"] : [],
    });

    await expect(
      assertCanDownloadR2Object(
        managerSession,
        { id: "attachment-id", kind: "reimbursementAttachment" },
        deps
      )
    ).resolves.toMatchObject({
      key: "app/attachments/reimbursement/receipt.pdf",
    });
  });

  it("rejects unrelated user for reimbursement attachment", async () => {
    const deps = createDeps({
      findReimbursementAttachment: async () => ({
        filename: "receipt.pdf",
        objectKey: "app/attachments/reimbursement/receipt.pdf",
        ownerUserId: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        otherSession,
        { id: "attachment-id", kind: "reimbursementAttachment" },
        deps
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects raw-key delete for persisted object paths", () => {
    expect(() =>
      assertCanDeleteTemporaryUpload(ownerSession, {
        key: "app/attachments/reimbursement/receipt.pdf",
        subfolder: "attachments",
      })
    ).toThrow(R2ObjectAccessError);
  });

  it("allows raw-key delete for current user's temporary upload", () => {
    const key = `${env.R2_KEY_PREFIX}/attachments/tmp/owner/receipt.pdf`;

    expect(
      assertCanDeleteTemporaryUpload(ownerSession, {
        key,
        subfolder: "attachments",
      })
    ).toEqual({
      filename: "receipt.pdf",
      key,
    });
  });

  it("allows uploader to resolve own pending event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: "Pending photo",
        r2Key: "app/photos/event-id/photo.jpg",
        status: "pending",
        uploadedBy: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        ownerSession,
        { id: "photo-id", kind: "eventPhoto" },
        deps
      )
    ).resolves.toMatchObject({ key: "app/photos/event-id/photo.jpg" });
  });

  it("allows team lead to resolve managed event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: null,
        r2Key: "app/photos/event-id/photo.jpg",
        status: "pending",
        uploadedBy: "owner",
      }),
      isTeamLead: async (teamId, userId) =>
        teamId === "team-id" && userId === "manager",
    });

    await expect(
      assertCanDownloadR2Object(
        managerSession,
        { id: "photo-id", kind: "eventPhoto" },
        deps
      )
    ).resolves.toMatchObject({ key: "app/photos/event-id/photo.jpg" });
  });

  it("allows events.manage_photos user to resolve managed event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: null,
        r2Key: "app/photos/event-id/photo.jpg",
        status: "pending",
        uploadedBy: "owner",
      }),
      resolvePermissions: async (role) =>
        role === "manager" ? ["events.manage_photos"] : [],
    });

    await expect(
      assertCanDownloadR2Object(
        managerSession,
        { id: "photo-id", kind: "eventPhoto" },
        deps
      )
    ).resolves.toMatchObject({ key: "app/photos/event-id/photo.jpg" });
  });

  it("allows scheduled message creator to resolve attachment by message and key", async () => {
    const deps = createDeps({
      findScheduledMessage: async () => ({
        attachments: [
          {
            fileName: "media.png",
            mimeType: "image/png",
            r2Key: "app/scheduled-messages/message-id/media.png",
          },
        ],
        createdBy: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        ownerSession,
        {
          id: "message-id",
          key: "app/scheduled-messages/message-id/media.png",
          kind: "scheduledMessageAttachment",
        },
        deps
      )
    ).resolves.toEqual({
      filename: "media.png",
      key: "app/scheduled-messages/message-id/media.png",
    });
  });

  it("rejects scheduled message attachment for unrelated user", async () => {
    const deps = createDeps({
      findScheduledMessage: async () => ({
        attachments: [
          {
            fileName: "media.png",
            mimeType: "image/png",
            r2Key: "app/scheduled-messages/message-id/media.png",
          },
        ],
        createdBy: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        otherSession,
        {
          id: "message-id",
          key: "app/scheduled-messages/message-id/media.png",
          kind: "scheduledMessageAttachment",
        },
        deps
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows messages.schedule user to resolve scheduled message attachment", async () => {
    const deps = createDeps({
      findScheduledMessage: async () => ({
        attachments: [
          {
            fileName: "media.png",
            mimeType: "image/png",
            r2Key: "app/scheduled-messages/message-id/media.png",
          },
        ],
        createdBy: "owner",
      }),
      resolvePermissions: async (role) =>
        role === "manager" ? ["messages.schedule"] : [],
    });

    await expect(
      assertCanDownloadR2Object(
        managerSession,
        {
          id: "message-id",
          key: "app/scheduled-messages/message-id/media.png",
          kind: "scheduledMessageAttachment",
        },
        deps
      )
    ).resolves.toMatchObject({
      key: "app/scheduled-messages/message-id/media.png",
    });
  });

  it("allows owner to resolve vendor payment transaction attachment", async () => {
    const deps = createDeps({
      findVendorPaymentTransactionAttachment: async () => ({
        filename: "receipt.pdf",
        objectKey: "app/attachments/vendor-payment-transaction/receipt.pdf",
        ownerUserId: "owner",
      }),
    });

    await expect(
      assertCanDownloadR2Object(
        ownerSession,
        { id: "attachment-id", kind: "vendorPaymentTransactionAttachment" },
        deps
      )
    ).resolves.toMatchObject({
      key: "app/attachments/vendor-payment-transaction/receipt.pdf",
    });
  });

  it("allows event member to upload event-scoped object for past event", async () => {
    const deps = createDeps({
      findEvent: async () => ({
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        teamId: "team-id",
      }),
      isEventMember: async (eventId, userId) =>
        eventId === "event-id" && userId === "owner",
    });

    await expect(
      assertCanUploadEventScopedObject(
        ownerSession,
        "event-id",
        "events.manage_photos",
        deps,
        new Date("2026-01-02T00:00:00.000Z")
      )
    ).resolves.toBeUndefined();
  });

  it("rejects event-scoped upload before the event starts", async () => {
    const deps = createDeps({
      findEvent: async () => ({
        startTime: new Date("2026-01-03T00:00:00.000Z"),
        teamId: "team-id",
      }),
      isEventMember: async () => true,
    });

    await expect(
      assertCanUploadEventScopedObject(
        ownerSession,
        "event-id",
        "events.manage_photos",
        deps,
        new Date("2026-01-02T00:00:00.000Z")
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("requires messages.schedule to upload scheduled message media", async () => {
    await expect(
      assertCanUploadScheduledMessageObject(ownerSession, createDeps())
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      assertCanUploadScheduledMessageObject(
        managerSession,
        createDeps({
          resolvePermissions: async (role) =>
            role === "manager" ? ["messages.schedule"] : [],
        })
      )
    ).resolves.toBeUndefined();
  });
});
