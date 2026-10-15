import { env } from "@pi-dash/env/server";

import { formatPhoneForWhatsApp } from "./phone";
import type { WhatsAppTemplateMessage } from "./template-message";
import { TEMPLATE_LANGUAGE, type TemplateCategory } from "./templates";

const GRAPH_URL = "https://graph.facebook.com";
/** Same as the email client: a hung request mustn't hold up a job. */
const REQUEST_TIMEOUT_MS = 10_000;

interface CloudConfig {
  accessToken: string;
  businessAccountId: string | undefined;
  graphVersion: string;
  phoneNumberId: string;
}

/** Set when the Cloud API is configured; notifications then go through Meta. */
export function getCloudConfig(): CloudConfig | undefined {
  const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  if (!(accessToken && phoneNumberId)) {
    return;
  }
  return {
    accessToken,
    businessAccountId: env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID,
    graphVersion: env.WHATSAPP_CLOUD_GRAPH_VERSION,
    phoneNumberId,
  };
}

export function isCloudApiEnabled(): boolean {
  return getCloudConfig() !== undefined;
}

/** A Graph API error, with Meta's code kept for the send log. */
export class CloudApiError extends Error {
  readonly code: number | undefined;
  readonly status: number;

  constructor(message: string, status: number, code: number | undefined) {
    super(message);
    this.name = "CloudApiError";
    this.code = code;
    this.status = status;
  }
}

interface GraphErrorBody {
  error?: {
    code?: number;
    error_user_msg?: string;
    error_user_title?: string;
    message?: string;
  };
}

async function graph<T>(
  config: CloudConfig,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${GRAPH_URL}/${config.graphVersion}/${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    method: body === undefined ? "GET" : "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await response.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!response.ok) {
    const error = json.error;
    const message =
      [error?.error_user_title, error?.error_user_msg ?? error?.message]
        .filter(Boolean)
        .join(": ") || `HTTP ${response.status}`;
    throw new CloudApiError(message, response.status, error?.code);
  }
  return json;
}

/**
 * Meta error codes worth retrying: throughput and per-pair rate limits,
 * temporary unavailability and app or account rate limits.
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 */
const TRANSIENT_CODES = new Set([
  1, 2, 4, 17, 80_007, 130_429, 131_000, 131_016, 131_056, 133_004,
]);

/**
 * True when a send should be retried: timeouts, network failures, 5xx and
 * Meta's rate limits. Anything else (bad template or parameter, paused
 * template, invalid number) fails the same way every time.
 */
export function isTransientCloudError(error: unknown): boolean {
  if (!(error instanceof CloudApiError)) {
    return true;
  }
  if (error.status >= 500 || error.status === 429) {
    return true;
  }
  return error.code !== undefined && TRANSIENT_CODES.has(error.code);
}

function requireConfig(): CloudConfig {
  const config = getCloudConfig();
  if (!config) {
    throw new Error("WhatsApp Cloud API is not configured");
  }
  return config;
}

interface SendResponse {
  messages?: Array<{ id?: string }>;
}

function messageId(response: SendResponse): string {
  const id = response.messages?.[0]?.id;
  if (!id) {
    throw new Error("WhatsApp Cloud API returned no message ID");
  }
  return id;
}

/** The `template` object of a send request. */
export function toTemplateSendBody(message: WhatsAppTemplateMessage) {
  const parameters = Object.entries(message.params).map(([name, text]) => ({
    parameter_name: name,
    text,
    type: "text" as const,
  }));
  return {
    components: [
      ...(parameters.length > 0 ? [{ parameters, type: "body" as const }] : []),
      ...(message.path === undefined
        ? []
        : [
            {
              index: "0",
              parameters: [
                {
                  // Already-encoded paths keep their `%` escapes.
                  text: message.path.includes("%")
                    ? message.path
                    : encodeURI(message.path),
                  type: "text" as const,
                },
              ],
              sub_type: "url" as const,
              type: "button" as const,
            },
          ]),
    ],
    language: { code: TEMPLATE_LANGUAGE },
    name: message.name,
  };
}

/** Send an approved template; returns Meta's message ID. */
export async function sendCloudTemplate(
  phone: string,
  message: WhatsAppTemplateMessage
): Promise<string> {
  const config = requireConfig();
  const response = await graph<SendResponse>(
    config,
    `${config.phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      template: toTemplateSendBody(message),
      to: formatPhoneForWhatsApp(phone),
      type: "template",
    }
  );
  return messageId(response);
}

/**
 * Send free text. Meta only delivers it within 24 hours of the person's
 * last message to us, so it's for replies, not notifications.
 */
export async function sendCloudText(
  phone: string,
  text: string
): Promise<string> {
  const config = requireConfig();
  const response = await graph<SendResponse>(
    config,
    `${config.phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      text: { body: text, preview_url: false },
      to: formatPhoneForWhatsApp(phone),
      type: "text",
    }
  );
  return messageId(response);
}

export interface RemoteTemplate {
  category: TemplateCategory | "AUTHENTICATION";
  name: string;
  status: string;
}

/** Every template on the WhatsApp Business Account, with its category. */
export async function listCloudTemplates(): Promise<RemoteTemplate[]> {
  const config = requireConfig();
  if (!config.businessAccountId) {
    throw new Error("WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID is not set");
  }
  const templates: RemoteTemplate[] = [];
  let path: string | undefined =
    `${config.businessAccountId}/message_templates?fields=name,status,category&limit=100`;
  while (path) {
    const page: { data: RemoteTemplate[]; paging?: { next?: string } } =
      await graph(config, path);
    templates.push(...page.data);
    const next = page.paging?.next;
    path = next
      ? next.slice(next.indexOf(config.businessAccountId))
      : undefined;
  }
  return templates;
}

const CATEGORY_TTL_MS = 60 * 60 * 1000;
/** After a failed lookup, wait this long before asking Meta again. */
const CATEGORY_FAILURE_TTL_MS = 5 * 60 * 1000;
let categoryCache: { at: number; byName: Map<string, RemoteTemplate> } | null =
  null;
let categoryFailure: { at: number; error: unknown } | null = null;

/**
 * A template's current category and status on Meta, refreshed hourly. Meta
 * moves templates between utility and marketing on its own, so senders that
 * care (the digest) check here instead of assuming. A failed lookup is
 * remembered for five minutes, so a flush every minute doesn't retry it.
 */
export async function getCloudTemplate(
  name: string,
  now = Date.now()
): Promise<RemoteTemplate | undefined> {
  if (!categoryCache || now - categoryCache.at > CATEGORY_TTL_MS) {
    if (categoryFailure && now - categoryFailure.at < CATEGORY_FAILURE_TTL_MS) {
      throw categoryFailure.error;
    }
    try {
      const templates = await listCloudTemplates();
      categoryCache = {
        at: now,
        byName: new Map(templates.map((t) => [t.name, t])),
      };
      categoryFailure = null;
    } catch (error) {
      categoryFailure = { at: now, error };
      throw error;
    }
  }
  return categoryCache.byName.get(name);
}

/** Forget cached categories; for tests. */
export function resetCloudTemplateCache(): void {
  categoryCache = null;
  categoryFailure = null;
}
