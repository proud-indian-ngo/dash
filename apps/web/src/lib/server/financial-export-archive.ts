import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { buildCsv, type CsvFile } from "@/lib/csv-export";

import type { StoredExportAttachment } from "./financial-export";

export interface FinancialExportArchiveAttachment {
  path: string;
  stream: ReadableStream<Uint8Array>;
}

const CONTROL_CHARACTERS = /\p{Cc}/gu;
const INVALID_PATH_CHARACTERS = /[<>:"/\\|?*]/g;
const LEADING_UNSAFE_CHARACTERS = /^[-. ]+/;
const REPEATED_DASHES = /-{2,}/g;
const TRAILING_UNSAFE_CHARACTERS = /[-. ]+$/;

export function sanitizeArchivePathSegment(
  input: null | string,
  fallback: string
): string {
  const sanitized = (input ?? "")
    .normalize("NFKC")
    .trim()
    .replaceAll(CONTROL_CHARACTERS, "-")
    .replaceAll(INVALID_PATH_CHARACTERS, "-")
    .replaceAll(REPEATED_DASHES, "-")
    .replace(LEADING_UNSAFE_CHARACTERS, "")
    .replace(TRAILING_UNSAFE_CHARACTERS, "")
    .slice(0, 160);
  return sanitized || fallback;
}

const addIdSuffix = (filename: string, id: string): string => {
  const extensionIndex = filename.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return `${filename}_${id}`;
  }
  return `${filename.slice(0, extensionIndex)}_${id}${filename.slice(extensionIndex)}`;
};

export function buildAttachmentArchivePaths(
  attachments: StoredExportAttachment[]
): Array<{ attachment: StoredExportAttachment; path: string }> {
  const entries = attachments.map((attachment) => {
    const safeId = sanitizeArchivePathSegment(attachment.id, "attachment");
    const safeTitle = sanitizeArchivePathSegment(
      attachment.parentTitle,
      "untitled"
    );
    const folder = `attachments/${attachment.requestType}/${sanitizeArchivePathSegment(attachment.parentId, "request")}_${safeTitle}`;
    const filename = sanitizeArchivePathSegment(
      attachment.filename,
      `attachment-${safeId}`
    );
    return { attachment, filename, folder };
  });
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const collisionKey = `${entry.folder}/${entry.filename}`.toLocaleLowerCase(
      "en-US"
    );
    counts.set(collisionKey, (counts.get(collisionKey) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const collisionKey = `${entry.folder}/${entry.filename}`.toLocaleLowerCase(
      "en-US"
    );
    const filename =
      (counts.get(collisionKey) ?? 0) > 1
        ? addIdSuffix(
            entry.filename,
            sanitizeArchivePathSegment(entry.attachment.id, "attachment")
          )
        : entry.filename;
    return {
      attachment: entry.attachment,
      path: `${entry.folder}/${filename}`,
    };
  });
}

export function createFinancialExportArchiveStream(
  csvFiles: CsvFile[],
  attachments: FinancialExportArchiveAttachment[],
  onError?: (error: unknown) => void
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        onError?.(error);
        controller.error(error);
      };
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        if (settled) {
          return;
        }
        if (chunk.length > 0) {
          controller.enqueue(chunk);
        }
        if (final) {
          settled = true;
          controller.close();
        }
      });

      const pipeStream = async (
        reader: ReadableStreamDefaultReader<Uint8Array>,
        zipEntry: ZipPassThrough
      ): Promise<void> => {
        const result = await reader.read();
        if (result.done) {
          zipEntry.push(new Uint8Array(), true);
          return;
        }
        zipEntry.push(result.value);
        await pipeStream(reader, zipEntry);
      };

      const addAttachment = async (index: number): Promise<void> => {
        const attachment = attachments[index];
        if (!attachment) {
          return;
        }
        const zipEntry = new ZipPassThrough(attachment.path);
        zip.add(zipEntry);
        const reader = attachment.stream.getReader();
        try {
          await pipeStream(reader, zipEntry);
        } finally {
          reader.releaseLock();
        }
        await addAttachment(index + 1);
      };

      const runArchive = async (): Promise<void> => {
        for (const csvFile of csvFiles) {
          const zipEntry = new ZipDeflate(csvFile.filename, { level: 6 });
          zip.add(zipEntry);
          zipEntry.push(strToU8(buildCsv(csvFile.headers, csvFile.rows)), true);
        }
        await addAttachment(0);
        zip.end();
      };
      runArchive().catch((error: unknown) => {
        if (!settled) {
          zip.terminate();
        }
        fail(error);
      });
    },
  });
}
