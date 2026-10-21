import { isLinkUrl, LINK_PROTOCOLS } from "@pi-dash/shared/rich-text";
import { KEYS } from "platejs";

/**
 * What the document preset keeps of the full one: the blocks, marks and
 * link addresses `@pi-dash/shared/rich-text` accepts, for the editor
 * (`RichTextKit`) and the renderer (`BaseRichTextKit`) alike.
 */

/** Blocks of the full preset's basic blocks: headings stop at three. */
export const DOCUMENT_BLOCKS = new Set<string>([
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.blockquote,
  KEYS.hr,
]);

export const DOCUMENT_MARKS = new Set<string>([
  KEYS.bold,
  KEYS.italic,
  KEYS.underline,
  KEYS.strikethrough,
]);

/** The blocks that indent. */
export const DOCUMENT_INDENTED: string[] = [KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3];

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const EMAIL = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/;

/** Schemes a link may use: web and email addresses, as the server checks. */
export const DOCUMENT_LINK_SCHEMES = LINK_PROTOCOLS.map((protocol) =>
  protocol.slice(0, -1)
);

/** The editor's link options: what the server accepts and nothing else. */
export const DOCUMENT_LINK_OPTIONS = {
  allowedSchemes: DOCUMENT_LINK_SCHEMES,
  isUrl: isLinkUrl,
  // An address typed without a scheme is a web or an email address.
  transformInput: (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || SCHEME.test(trimmed)) {
      return trimmed;
    }
    return EMAIL.test(trimmed) ? `mailto:${trimmed}` : `https://${trimmed}`;
  },
};
