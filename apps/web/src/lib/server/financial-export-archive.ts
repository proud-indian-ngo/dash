import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { buildCsv, type CsvFile } from "@/lib/csv-export";

import type { StoredExportAttachment } from "./financial-export";

export interface FinancialExportArchiveAttachment {
  path: string;
  stream: () => ReadableStream<Uint8Array>;
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
  let cancelled = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  async function* generateArchive(): AsyncGenerator<Uint8Array, void> {
    const chunks: Uint8Array[] = [];
    // These synchronous ZIP entries emit only while add/push/end is running.
    const zip = new Zip((error, chunk) => {
      if (error) {
        throw error;
      }
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    });
    try {
      for (const csvFile of csvFiles) {
        const entry = new ZipDeflate(csvFile.filename, { level: 6 });
        zip.add(entry);
        entry.push(strToU8(buildCsv(csvFile.headers, csvFile.rows)), true);
        yield* chunks.splice(0);
      }
      for (const attachment of attachments) {
        const entry = new ZipPassThrough(attachment.path);
        zip.add(entry);
        const reader = attachment.stream().getReader();
        activeReader = reader;
        try {
          while (!cancelled) {
            const result = await reader.read();
            if (cancelled) {
              return;
            }
            entry.push(result.value ?? new Uint8Array(), result.done);
            yield* chunks.splice(0);
            if (result.done) {
              break;
            }
          }
        } finally {
          activeReader = undefined;
          reader.releaseLock();
        }
      }
      zip.end();
      yield* chunks.splice(0);
    } finally {
      zip.terminate();
    }
  }

  const archive = generateArchive();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const result = await archive.next();
          if (cancelled) {
            return;
          }
          if (result.done) {
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        } catch (error) {
          if (!cancelled) {
            controller.error(error);
            onError?.(error);
          }
        }
      },
      async cancel(reason) {
        cancelled = true;
        try {
          await activeReader?.cancel(reason);
        } finally {
          await archive.return();
        }
      },
    },
    { highWaterMark: 0 }
  );
}
