import {
  templateParameters,
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplateName,
} from "./templates";

type Template = (typeof WHATSAPP_TEMPLATES)[number];
type TemplateNamed<N extends WhatsAppTemplateName> = Extract<
  Template,
  { name: N }
>;

type ParametersOf<S extends string> =
  S extends `${string}{{${infer P}}}${infer Rest}`
    ? P | ParametersOf<Rest>
    : never;

/** The values a template's `{{parameters}}` need, by name. */
export type TemplateParams<N extends WhatsAppTemplateName> = Record<
  ParametersOf<TemplateNamed<N>["body"]>,
  string
>;

/** True when the template's button link ends in a path the sender supplies. */
type NeedsPath<N extends WhatsAppTemplateName> =
  TemplateNamed<N> extends { dashboardPath: infer P }
    ? P extends ""
      ? false
      : true
    : false;

type NeedsDocument<N extends WhatsAppTemplateName> =
  TemplateNamed<N> extends { headerFormat: "DOCUMENT" } ? true : false;

export interface WhatsAppDocument {
  bytes: Uint8Array;
  filename: string;
}

/** A filled-in template, ready to send or hold for the batching window. */
export interface WhatsAppTemplateMessage {
  /** The PDF attached through a DOCUMENT template header. */
  document?: WhatsAppDocument;
  name: WhatsAppTemplateName;
  params: Record<string, string>;
  /** The dashboard path the button opens, without the leading slash. */
  path?: string;
}

/** Meta rejects longer values in a message; a value is one short line. */
const PARAMETER_MAX_LENGTH = 300;
/** Meta's limit for a body once its parameters are filled in. */
export const BODY_MAX_LENGTH = 1024;
/** No value is cut shorter than this to make room for the others. */
const PARAMETER_MIN_LENGTH = 20;

const TEMPLATE_BODIES: ReadonlyMap<string, string> = new Map(
  WHATSAPP_TEMPLATES.map((t) => [t.name, t.body])
);

function cut(value: string, length: number): string {
  return value.length > length
    ? `${value.slice(0, length - 1).trimEnd()}…`
    : value;
}

/**
 * Shorten the longest values until the filled-in body fits Meta's 1024
 * characters; past that limit Meta rejects the message for good.
 */
export function fitToBody(
  body: string,
  params: Record<string, string>
): Record<string, string> {
  const fixed = templateParameters(body).reduce(
    (length, name) => length - `{{${name}}}`.length,
    body.length
  );
  const fitted = { ...params };
  let excess =
    fixed +
    Object.values(fitted).reduce((sum, v) => sum + v.length, 0) -
    BODY_MAX_LENGTH;
  while (excess > 0) {
    const [key, value] = Object.entries(fitted).reduce((longest, entry) =>
      entry[1].length > longest[1].length ? entry : longest
    );
    const room = value.length - PARAMETER_MIN_LENGTH;
    if (room <= 0) {
      break;
    }
    const shortened = cut(value, value.length - Math.min(room, excess));
    excess -= value.length - shortened.length;
    fitted[key] = shortened;
  }
  return fitted;
}

/**
 * Parameter values can't hold new lines, tabs or runs of spaces, or be
 * empty, so a note or reason someone typed is flattened to one line.
 */
export function flattenParameter(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat === "") {
    return "-";
  }
  return cut(flat, PARAMETER_MAX_LENGTH);
}

/**
 * Build a template message. Parameter names and the required delivery value
 * (a button path or document) come from `templates.ts`, so a mismatch fails
 * type checking.
 */
export function whatsappTemplate<N extends WhatsAppTemplateName>(
  name: N,
  params: TemplateParams<N>,
  ...delivery: NeedsDocument<N> extends true
    ? [document: WhatsAppDocument]
    : NeedsPath<N> extends true
      ? [path: string]
      : []
): WhatsAppTemplateMessage {
  const flat = Object.fromEntries(
    Object.entries(params as Record<string, string>).map(([key, value]) => [
      key,
      flattenParameter(value),
    ])
  );
  const [deliveryOption] = delivery as [string | WhatsAppDocument | undefined];
  const document =
    typeof deliveryOption === "object" ? deliveryOption : undefined;
  const buttonPath =
    typeof deliveryOption === "string" ? deliveryOption : undefined;
  return {
    ...(document === undefined ? {} : { document }),
    name,
    params: fitToBody(TEMPLATE_BODIES.get(name) ?? "", flat),
    ...(buttonPath === undefined
      ? {}
      : { path: buttonPath.replace(/^\/+/, "") }),
  };
}
