import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const queryMocks = hoisted(() => ({
  advancePayment: mock(),
  advancePaymentAttachment: mock(),
  eventPhoto: mock(),
  reimbursement: mock(),
  reimbursementAttachment: mock(),
  scheduledMessage: mock(),
  teamEvent: mock(),
  teamEventMember: mock(),
  teamMember: mock(),
  vendorPayment: mock(),
  vendorPaymentAttachment: mock(),
  vendorPaymentTransaction: mock(),
  vendorPaymentTransactionAttachment: mock(),
}));

mock.module("@pi-dash/db", () => ({
  db: {
    query: Object.fromEntries(
      Object.entries(queryMocks).map(([name, findFirst]) => [
        name,
        { findFirst },
      ])
    ),
  },
}));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import {
  type AuthorizedR2ObjectDeps,
  resolveAuthorizedR2Object,
} from "./authorized-r2-object";
import { R2ObjectAccessError } from "./r2-object-access";

const session = { user: { id: "owner", role: "volunteer" } };

const createDeps = (
  overrides: Partial<AuthorizedR2ObjectDeps> = {}
): AuthorizedR2ObjectDeps => ({
  canReadKalakritiEntryMusic: async () => false,
  findRecord: async () => null,
  isEventMember: async () => false,
  isTeamLead: async () => false,
  isTeamMember: async () => false,
  resolvePermissions: async () => [],
  ...overrides,
});

beforeEach(() => {
  for (const mock of Object.values(queryMocks)) {
    mock.mockReset();
    mock.mockResolvedValue(null);
  }
});

describe("resolveAuthorizedR2Object", () => {
  it("returns not found when no DB record matches the asset reference", async () => {
    await expect(
      resolveAuthorizedR2Object(
        session,
        { id: "missing", kind: "reimbursementAttachment" },
        createDeps()
      )
    ).rejects.toEqual(new R2ObjectAccessError(404, "Object not found"));
  });

  it("resolves an advance-payment attachment by its exact row ID", async () => {
    queryMocks.advancePaymentAttachment.mockResolvedValue({
      advancePaymentId: "advance-1",
      filename: "advance.pdf",
      objectKey: "legacy/advance.pdf",
      type: "file",
    });
    queryMocks.advancePayment.mockResolvedValue({ userId: "owner" });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "attachment-1",
        kind: "advancePaymentAttachment",
      })
    ).resolves.toEqual({
      filename: "advance.pdf",
      key: "legacy/advance.pdf",
    });
  });

  it("resolves an advance-payment approval screenshot by parent ID", async () => {
    queryMocks.advancePayment.mockResolvedValue({
      approvalScreenshotKey: "legacy/advance-proof.png",
      userId: "owner",
    });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "advance-1",
        kind: "advancePaymentApprovalScreenshot",
      })
    ).resolves.toEqual({
      filename: "advance-proof.png",
      key: "legacy/advance-proof.png",
    });
  });

  it("resolves an event photo with its parent access attributes", async () => {
    queryMocks.eventPhoto.mockResolvedValue({
      caption: "Event photo",
      eventId: "event-1",
      r2Key: "legacy/event.jpg",
      status: "approved",
      uploadedBy: "uploader",
    });
    queryMocks.teamEvent.mockResolvedValue({
      isPublic: true,
      teamId: "team-1",
    });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "photo-1",
        kind: "eventPhoto",
      })
    ).resolves.toEqual({
      filename: "Event photo",
      key: "legacy/event.jpg",
    });
  });

  it("resolves a reimbursement attachment by its exact row ID", async () => {
    queryMocks.reimbursementAttachment.mockResolvedValue({
      filename: "receipt.pdf",
      objectKey: "legacy/receipt.pdf",
      reimbursementId: "request-1",
      type: "file",
    });
    queryMocks.reimbursement.mockResolvedValue({ userId: "owner" });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "attachment-1",
        kind: "reimbursementAttachment",
      })
    ).resolves.toEqual({
      filename: "receipt.pdf",
      key: "legacy/receipt.pdf",
    });
  });

  it("resolves a reimbursement approval screenshot by parent ID", async () => {
    queryMocks.reimbursement.mockResolvedValue({
      approvalScreenshotKey: "legacy/reimbursement-proof.png",
      userId: "owner",
    });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "request-1",
        kind: "reimbursementApprovalScreenshot",
      })
    ).resolves.toEqual({
      filename: "reimbursement-proof.png",
      key: "legacy/reimbursement-proof.png",
    });
  });

  it("resolves only the exact scheduled-message attachment key", async () => {
    queryMocks.scheduledMessage.mockResolvedValue({
      attachments: [
        {
          fileName: "schedule.pdf",
          r2Key: "legacy/schedule.pdf",
        },
      ],
      createdBy: "owner",
    });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "message-1",
        key: "legacy/schedule.pdf",
        kind: "scheduledMessageAttachment",
      })
    ).resolves.toEqual({
      filename: "schedule.pdf",
      key: "legacy/schedule.pdf",
    });
    await expect(
      resolveAuthorizedR2Object(session, {
        id: "message-1",
        key: "legacy/other.pdf",
        kind: "scheduledMessageAttachment",
      })
    ).rejects.toEqual(new R2ObjectAccessError(404, "Object not found"));
  });

  it("resolves a vendor-payment attachment by its exact row ID", async () => {
    queryMocks.vendorPaymentAttachment.mockResolvedValue({
      filename: "invoice.pdf",
      objectKey: "legacy/invoice.pdf",
      type: "file",
      vendorPaymentId: "vendor-payment-1",
    });
    queryMocks.vendorPayment.mockResolvedValue({ userId: "owner" });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "attachment-1",
        kind: "vendorPaymentAttachment",
      })
    ).resolves.toEqual({
      filename: "invoice.pdf",
      key: "legacy/invoice.pdf",
    });
  });

  it("resolves a vendor transaction attachment for its transaction owner", async () => {
    queryMocks.vendorPaymentTransactionAttachment.mockResolvedValue({
      filename: "payment.pdf",
      objectKey: "legacy/payment.pdf",
      type: "file",
      vendorPaymentTransactionId: "transaction-1",
    });
    queryMocks.vendorPaymentTransaction.mockResolvedValue({
      userId: "owner",
      vendorPaymentId: "vendor-payment-1",
    });
    queryMocks.vendorPayment.mockResolvedValue({ userId: "request-owner" });

    await expect(
      resolveAuthorizedR2Object(session, {
        id: "attachment-1",
        kind: "vendorPaymentTransactionAttachment",
      })
    ).resolves.toEqual({
      filename: "payment.pdf",
      key: "legacy/payment.pdf",
    });
  });

  it("resolves Kalakriti Entry music through a live registration-scope check", async () => {
    await expect(
      resolveAuthorizedR2Object(
        session,
        { id: "entry-1", kind: "kalakritiEntryMusic" },
        createDeps({
          canReadKalakritiEntryMusic: async () => true,
          findRecord: async () => ({
            access: "kalakritiEntryMusic",
            centerId: "center-1",
            competitionCategoryId: "category-1",
            competitionId: "competition-1",
            editionYear: 2026,
            filename: "track.mp3",
            key: "app/kalakriti-music/edition/entry/track.mp3",
          }),
        })
      )
    ).resolves.toEqual({
      filename: "track.mp3",
      key: "app/kalakriti-music/edition/entry/track.mp3",
    });
  });

  it("denies Kalakriti Entry music when the registration scope does not match", async () => {
    await expect(
      resolveAuthorizedR2Object(
        session,
        { id: "entry-1", kind: "kalakritiEntryMusic" },
        createDeps({
          findRecord: async () => ({
            access: "kalakritiEntryMusic",
            centerId: "center-2",
            competitionCategoryId: "category-1",
            competitionId: "competition-1",
            editionYear: 2026,
            filename: "track.mp3",
            key: "app/kalakriti-music/edition/entry/track.mp3",
          }),
        })
      )
    ).rejects.toEqual(new R2ObjectAccessError(403, "Forbidden"));
  });
});
