import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import {
  type AuthorizedR2ObjectDeps,
  assertCanDeleteR2Object,
  assertCanDownloadR2Object,
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

  it("rejects raw-key delete for persisted object paths", async () => {
    const deps = createDeps();

    await expect(
      assertCanDeleteR2Object(
        ownerSession,
        {
          key: "app/attachments/reimbursement/receipt.pdf",
          kind: "temporaryUpload",
          subfolder: "attachments",
        },
        deps
      )
    ).rejects.toBeInstanceOf(R2ObjectAccessError);
  });

  it("allows uploader to resolve own pending event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: "Pending photo",
        r2Key: "app/photos/event/photo.jpg",
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
    ).resolves.toMatchObject({ key: "app/photos/event/photo.jpg" });
  });

  it("allows team lead to resolve managed event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: null,
        r2Key: "app/photos/event/photo.jpg",
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
    ).resolves.toMatchObject({ key: "app/photos/event/photo.jpg" });
  });

  it("allows events.manage_photos user to resolve managed event photo", async () => {
    const deps = createDeps({
      findEventPhoto: async () => ({
        eventId: "event-id",
        eventTeamId: "team-id",
        filename: null,
        r2Key: "app/photos/event/photo.jpg",
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
    ).resolves.toMatchObject({ key: "app/photos/event/photo.jpg" });
  });
});
