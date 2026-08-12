import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { CsvFile } from "@/lib/csv-export";
import type { StoredExportAttachment } from "./financial-export";
import {
  buildAttachmentArchivePaths,
  createFinancialExportArchiveStream,
  sanitizeArchivePathSegment,
} from "./financial-export-archive";

const csvFiles: CsvFile[] = [
  {
    filename: "reimbursements.csv",
    headers: ["Title", "Attachment"],
    rows: [["Travel", "https://example.test/receipt"]],
  },
];

const storedAttachment = (
  overrides: Partial<StoredExportAttachment> = {}
): StoredExportAttachment => ({
  filename: "receipt.pdf",
  id: "attachment-1",
  objectKey: "app/attachments/receipt.pdf",
  parentId: "request-1",
  parentTitle: "Travel / Mumbai",
  requestType: "reimbursements",
  ...overrides,
});

const byteStream = (value: string) =>
  new Blob([value]).stream() as ReadableStream<Uint8Array>;

describe("financial export archive", () => {
  it("sanitizes path segments and provides a stable fallback", () => {
    expect(sanitizeArchivePathSegment("../Travel\\2026", "fallback")).toBe(
      "Travel-2026"
    );
    expect(sanitizeArchivePathSegment("...", "fallback")).toBe("fallback");
  });

  it("uses request folders, attachment fallbacks, and IDs for collisions", () => {
    const paths = buildAttachmentArchivePaths([
      storedAttachment(),
      storedAttachment({ id: "attachment-2", objectKey: "second" }),
      storedAttachment({
        filename: null,
        id: "attachment-3",
        objectKey: "third",
        parentId: "request-2",
        parentTitle: "",
        requestType: "advance-payments",
      }),
    ]).map((entry) => entry.path);

    expect(paths).toEqual([
      "attachments/reimbursements/request-1_Travel - Mumbai/receipt_attachment-1.pdf",
      "attachments/reimbursements/request-1_Travel - Mumbai/receipt_attachment-2.pdf",
      "attachments/advance-payments/request-2_untitled/attachment-attachment-3",
    ]);
  });

  it("streams CSV and attachment bytes into one valid ZIP", async () => {
    const stream = createFinancialExportArchiveStream(csvFiles, [
      {
        path: "attachments/reimbursements/request-1_Travel/receipt.pdf",
        stream: byteStream("receipt bytes"),
      },
      {
        path: "attachments/advance-payments/request-2_Advance/invoice.png",
        stream: byteStream("image bytes"),
      },
    ]);
    const archive = unzipSync(
      new Uint8Array(await new Response(stream).arrayBuffer())
    );

    expect(Object.keys(archive).sort()).toEqual([
      "attachments/advance-payments/request-2_Advance/invoice.png",
      "attachments/reimbursements/request-1_Travel/receipt.pdf",
      "reimbursements.csv",
    ]);
    expect(strFromU8(archive["reimbursements.csv"] ?? new Uint8Array())).toBe(
      "Title,Attachment\nTravel,https://example.test/receipt"
    );
    expect(
      strFromU8(
        archive["attachments/reimbursements/request-1_Travel/receipt.pdf"] ??
          new Uint8Array()
      )
    ).toBe("receipt bytes");
  });

  it("propagates attachment stream failures", async () => {
    const onError = vi.fn();
    const stream = createFinancialExportArchiveStream(
      csvFiles,
      [
        {
          path: "attachments/reimbursements/request-1/file.pdf",
          stream: new ReadableStream({
            start(controller) {
              controller.error(new Error("R2 stream failed"));
            },
          }),
        },
      ],
      onError
    );

    await expect(new Response(stream).arrayBuffer()).rejects.toThrow(
      "R2 stream failed"
    );
    expect(onError).toHaveBeenCalledOnce();
  });
});
