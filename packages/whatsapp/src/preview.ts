import {
  DASHBOARD_BUTTON_TEXT,
  TEMPLATE_FOOTER,
  type WhatsAppTemplate,
} from "./templates";

/** A run of text in one line; `*bold*` in a template becomes a bold run. */
export interface WhatsAppTextRun {
  bold: boolean;
  text: string;
}

/** A template message as the recipient sees it, line by line. */
export interface WhatsAppPreview {
  body: WhatsAppTextRun[][];
  button: string | null;
  /** False when the values weren't recorded, so `{{placeholders}}` show. */
  filled: boolean;
  footer: string;
  header: string | null;
}

type PreviewTemplate = Pick<
  WhatsAppTemplate,
  "body" | "buttonText" | "dashboardPath" | "header" | "headerFormat" | "footer"
>;

const PARAMETER = /\{\{([a-z_]+)\}\}/g;
const BOLD = /\*([^*\n]+)\*/g;
/** A body never holds two blank lines in a row (templates.test.ts). */
const HEADER_BREAK = "\n\n\n";

/**
 * The copy a send stores in `template_body`: the header, if any, then the
 * body. Templates are edited in place, so this keeps what was sent.
 */
export function storedTemplateText(
  template: Pick<WhatsAppTemplate, "body" | "header">
): string {
  return template.header === undefined
    ? template.body
    : `${template.header}${HEADER_BREAK}${template.body}`;
}

/** Split `storedTemplateText()` back up; older rows hold only the body. */
export function parseStoredTemplateText(text: string): {
  body: string;
  header?: string;
} {
  const at = text.indexOf(HEADER_BREAK);
  return at === -1
    ? { body: text }
    : { body: text.slice(at + HEADER_BREAK.length), header: text.slice(0, at) };
}

function runs(line: string): WhatsAppTextRun[] {
  const result: WhatsAppTextRun[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD)) {
    if (match.index > last) {
      result.push({ bold: false, text: line.slice(last, match.index) });
    }
    result.push({ bold: true, text: match[1] as string });
    last = match.index + match[0].length;
  }
  if (last < line.length || result.length === 0) {
    result.push({ bold: false, text: line.slice(last) });
  }
  return result;
}

/**
 * Fill a template with the parameters a send recorded. With none recorded
 * (older rows), the body keeps its `{{placeholders}}`.
 */
export function renderWhatsAppPreview(
  template: PreviewTemplate,
  params: Record<string, string> | null
): WhatsAppPreview {
  const fill = (text: string) =>
    params
      ? text.replace(PARAMETER, (match, name: string) => params[name] ?? match)
      : text;
  return {
    body: fill(template.body).split("\n").map(runs),
    button:
      template.dashboardPath === undefined
        ? null
        : (template.buttonText ?? DASHBOARD_BUTTON_TEXT),
    filled: params !== null,
    footer: template.footer ?? TEMPLATE_FOOTER,
    header:
      template.headerFormat !== "DOCUMENT" && template.header
        ? fill(template.header)
        : null,
  };
}
