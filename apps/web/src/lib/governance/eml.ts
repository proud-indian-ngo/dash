/**
 * Headers of an `.eml` kept as evidence (for example a trustee's resignation
 * by email). Only the envelope facts are kept in the vault's report: who
 * sent it, to whom, when, the subject, the message ID, whether it carries a
 * DKIM signature, and the names of its attachments. The body is never read
 * into the report.
 */

export interface EmailEvidence {
  attachments: string[];
  date: string | null;
  dkimSigned: boolean;
  from: string | null;
  messageId: string | null;
  subject: string | null;
  to: string | null;
}

const HEADER_BLOCK_END = /\r?\n\r?\n/;
const MAX_HEADER_VALUE = 500;
const MAX_ATTACHMENTS = 20;

/** Decodes RFC 2047 encoded words (`=?UTF-8?B?...?=` and `=?UTF-8?Q?...?=`). */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(
      /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
      (whole, charset: string, encoding: string, text: string) => {
        try {
          const bytes =
            encoding.toUpperCase() === "B"
              ? Buffer.from(text, "base64")
              : Buffer.from(
                  text
                    .replace(/_/g, " ")
                    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
                      String.fromCharCode(Number.parseInt(hex, 16))
                    ),
                  "latin1"
                );
          return new TextDecoder(charset.toLowerCase()).decode(bytes);
        } catch {
          return whole;
        }
      }
    );
}

/** Header name (lower-cased) to its unfolded values, in order. */
export function parseHeaderBlock(block: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers.set(name, [...(headers.get(name) ?? []), value]);
  }
  return headers;
}

function first(headers: Map<string, string[]>, name: string): string | null {
  const value = headers.get(name)?.[0];
  return value ? decodeEncodedWords(value).slice(0, MAX_HEADER_VALUE) : null;
}

/** Attachment file names from the MIME parts' headers. */
function attachmentNames(text: string): string[] {
  const names = new Set<string>();
  const pattern =
    /Content-Disposition:\s*attachment[^\n]*(?:\r?\n[ \t][^\n]*)*/gi;
  for (const match of text.matchAll(pattern)) {
    const header = match[0].replace(/\r?\n[ \t]+/g, " ");
    const quoted = /filename\*?="?([^";]+)"?/i.exec(header);
    if (quoted?.[1]) {
      names.add(
        decodeEncodedWords(quoted[1].replace(/^UTF-8''/i, ""))
          .trim()
          .slice(0, 200)
      );
    }
    if (names.size >= MAX_ATTACHMENTS) {
      break;
    }
  }
  return [...names];
}

/** The envelope facts of a raw `.eml`, or null when it has no headers to read. */
export function readEmailEvidence(raw: Uint8Array): EmailEvidence | null {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
  const end = HEADER_BLOCK_END.exec(text);
  const block = end ? text.slice(0, end.index) : text;
  const headers = parseHeaderBlock(block);
  if (!(headers.has("from") || headers.has("date"))) {
    return null;
  }
  return {
    attachments: attachmentNames(text),
    date: first(headers, "date"),
    dkimSigned: headers.has("dkim-signature"),
    from: first(headers, "from"),
    messageId: first(headers, "message-id"),
    subject: first(headers, "subject"),
    to: first(headers, "to"),
  };
}
