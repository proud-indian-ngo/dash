import { describe, expect, it, mock } from "bun:test";

import { strFromU8, unzipSync } from "fflate";

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
        stream: () => byteStream("receipt bytes"),
      },
      {
        path: "attachments/advance-payments/request-2_Advance/invoice.png",
        stream: () => byteStream("image bytes"),
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
    const onError = mock();
    const stream = createFinancialExportArchiveStream(
      csvFiles,
      [
        {
          path: "attachments/reimbursements/request-1/file.pdf",
          stream: () =>
            new ReadableStream({
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
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not drain attachments while the download is paused", async () => {
    let reads = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
        if (reads === 100) {
          controller.close();
        }
      },
    });
    const archive = createFinancialExportArchiveStream(
      [],
      [{ path: "large.pdf", stream: () => source }]
    );
    const reader = archive.getReader();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads).toBeLessThan(5);
    await reader.cancel();
  });

  it("cancels an attachment read when the download disconnects", async () => {
    const cancel = mock();
    let signalRead: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    const source = new ReadableStream<Uint8Array>(
      {
        cancel,
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        pull() {
          signalRead();
        },
      },
      { highWaterMark: 0 }
    );
    const nextStream = mock(() => byteStream("next"));
    const onError = mock();
    const archive = createFinancialExportArchiveStream(
      [],
      [
        { path: "stalled.pdf", stream: () => source },
        { path: "next.pdf", stream: nextStream },
      ],
      onError
    );
    const reader = archive.getReader();
    await reader.read();
    await reader.read();
    const pending = reader.read();
    await reading;
    await reader.cancel("disconnected");
    await pending;
    expect(cancel).toHaveBeenCalledWith("disconnected");
    expect(source.locked).toBe(false);
    expect(nextStream).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("opens no attachment streams when cancelled before reading", async () => {
    const open = mock(() => byteStream("unread"));
    const archive = createFinancialExportArchiveStream(
      [],
      [{ path: "unread.pdf", stream: open }]
    );
    await archive.cancel();
    expect(open).not.toHaveBeenCalled();
  });

  it("produces a valid empty archive", async () => {
    const stream = createFinancialExportArchiveStream([], []);
    expect(
      unzipSync(new Uint8Array(await new Response(stream).arrayBuffer()))
    ).toEqual({});
  });
});
