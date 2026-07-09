import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@/lib/api-auth", () => ({ assertServerPermission: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({
        handler: (handler: unknown) => handler,
      }),
    }),
  }),
}));
vi.mock("@/middleware/auth", () => ({ authMiddleware: {} }));

import { groupExportAttachments } from "./export-csv";

describe("groupExportAttachments", () => {
  it("adds reimbursement attachment kind and keeps ids", () => {
    const grouped = groupExportAttachments(
      [
        {
          filename: "receipt.pdf",
          id: "attachment-id",
          mimeType: "application/pdf",
          parentId: "request-id",
          type: "file" as const,
          url: null,
        },
      ],
      "reimbursementAttachment"
    );

    expect(grouped.get("request-id")).toEqual([
      {
        filename: "receipt.pdf",
        id: "attachment-id",
        kind: "reimbursementAttachment",
        mimeType: "application/pdf",
        type: "file",
        url: null,
      },
    ]);
  });

  it("adds advance payment attachment kind and keeps ids", () => {
    const grouped = groupExportAttachments(
      [
        {
          filename: "receipt.pdf",
          id: "attachment-id",
          mimeType: "application/pdf",
          parentId: "request-id",
          type: "file" as const,
          url: null,
        },
      ],
      "advancePaymentAttachment"
    );

    expect(grouped.get("request-id")?.[0]).toMatchObject({
      id: "attachment-id",
      kind: "advancePaymentAttachment",
    });
  });
});
