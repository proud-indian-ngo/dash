import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  advancePayment: vi.fn(),
  advancePaymentAttachment: vi.fn(),
  eventPhoto: vi.fn(),
  reimbursement: vi.fn(),
  reimbursementAttachment: vi.fn(),
  scheduledMessage: vi.fn(),
  teamEvent: vi.fn(),
  teamEventMember: vi.fn(),
  teamMember: vi.fn(),
  vendorPayment: vi.fn(),
  vendorPaymentAttachment: vi.fn(),
  vendorPaymentTransaction: vi.fn(),
  vendorPaymentTransactionAttachment: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({
  db: {
    query: Object.fromEntries(
      Object.entries(queryMocks).map(([name, findFirst]) => [
        name,
        { findFirst },
      ])
    ),
  },
}));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
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
      filename: "payment-proof",
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
      filename: "payment-proof",
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
});
