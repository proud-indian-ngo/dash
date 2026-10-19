import { createHash } from "node:crypto";

import { createRequestLogger } from "evlog";

import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";

function hashIdempotencyKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * GoWA's ID for the message it accepted, or undefined when the body has
 * none. Never throws: the message is already sent, so a retry would send
 * it again.
 */
async function readMessageId(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as {
      results?: { message_id?: unknown };
    };
    const id = data.results?.message_id;
    return typeof id === "string" && id !== "" ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options?: { idempotencyKey?: string }
): Promise<string | undefined> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppMessage",
  });
  log.set({ phone });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return undefined;
  }

  const formatted = formatPhoneForWhatsApp(phone);

  const response = await fetch(`${apiUrl}/send/message`, {
    body: JSON.stringify({ message, phone: formatted }),
    headers: {
      ...getWhatsAppHeaders(),
      ...(options?.idempotencyKey
        ? { "Idempotency-Key": hashIdempotencyKey(options.idempotencyKey) }
        : {}),
    },
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp API error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const messageId = await readMessageId(response);
  log.set({ event: "message_sent", messageId });
  log.emit();
  return messageId;
}

export async function sendWhatsAppGroupMessage(
  groupJid: string,
  message: string,
  options?: { replyMessageId?: string }
): Promise<string | undefined> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppGroupMessage",
  });
  log.set({ groupJid, replyMessageId: options?.replyMessageId });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return undefined;
  }

  const body: Record<string, string> = { message, phone: groupJid };
  if (options?.replyMessageId) {
    body.reply_message_id = options.replyMessageId;
  }

  const response = await fetch(`${apiUrl}/send/message`, {
    body: JSON.stringify(body),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `WhatsApp group message error ${response.status}: ${text}`
    );
    log.error(error);
    log.emit();
    throw error;
  }

  const messageId = await readMessageId(response);
  log.set({ event: "message_sent", messageId });
  log.emit();
  return messageId;
}

export async function sendWhatsAppPoll(
  groupJid: string,
  question: string,
  options: string[],
  maxAnswer = 1
): Promise<string> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppPoll",
  });
  log.set({ groupJid, maxAnswer, optionCount: options.length, question });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    throw new Error("WhatsApp not configured");
  }

  const response = await fetch(`${apiUrl}/send/poll`, {
    body: JSON.stringify({
      max_answer: maxAnswer,
      options,
      phone: groupJid,
      question,
    }),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp poll error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const data = (await response.json()) as {
    results?: { message_id?: string };
  };
  const messageId = data.results?.message_id;
  if (!messageId) {
    const error = new Error("WhatsApp poll response missing message_id");
    log.error(error);
    log.emit();
    throw error;
  }

  log.set({ event: "poll_sent", messageId });
  log.emit();
  return messageId;
}

export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<string | undefined> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppImage",
  });
  log.set({ phone });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return undefined;
  }

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("image_url", imageUrl);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/image`, {
    body: formData,
    headers: getWhatsAppHeaders({ omitContentType: true }),
    method: "POST",
  });

  if (!response.ok) {
    const error = new Error(`WhatsApp image error ${response.status}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const messageId = await readMessageId(response);
  log.set({ event: "image_sent", messageId });
  log.emit();
  return messageId;
}

export async function sendWhatsAppVideo(
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<string | undefined> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppVideo",
  });
  log.set({ phone });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return undefined;
  }

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("video_url", videoUrl);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/video`, {
    body: formData,
    headers: getWhatsAppHeaders({ omitContentType: true }),
    method: "POST",
  });

  if (!response.ok) {
    const error = new Error(`WhatsApp video error ${response.status}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const messageId = await readMessageId(response);
  log.set({ event: "video_sent", messageId });
  log.emit();
  return messageId;
}

export async function sendWhatsAppFile(
  phone: string,
  fileUrl: string,
  fileName: string,
  caption?: string
): Promise<string | undefined> {
  const log = createRequestLogger({ method: "POST", path: "sendWhatsAppFile" });
  log.set({ fileName, phone });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return undefined;
  }

  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    const error = new Error(`Failed to download file ${fileResponse.status}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const blob = await fileResponse.blob();

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("file", blob, fileName);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/file`, {
    body: formData,
    headers: getWhatsAppHeaders({ omitContentType: true }),
    method: "POST",
  });

  if (!response.ok) {
    const error = new Error(`WhatsApp file error ${response.status}`);
    log.error(error);
    log.emit();
    throw error;
  }

  const messageId = await readMessageId(response);
  log.set({ event: "file_sent", messageId });
  log.emit();
  return messageId;
}

export interface WhatsAppMediaAttachment {
  fileName: string;
  mimeType: string;
  url: string;
}

const WAPI_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export async function sendWhatsAppMedia(
  phone: string,
  attachment: WhatsAppMediaAttachment,
  caption?: string
): Promise<string | undefined> {
  if (WAPI_IMAGE_TYPES.has(attachment.mimeType)) {
    return await sendWhatsAppImage(phone, attachment.url, caption);
  }
  if (attachment.mimeType.startsWith("video/")) {
    return await sendWhatsAppVideo(phone, attachment.url, caption);
  }
  return await sendWhatsAppFile(
    phone,
    attachment.url,
    attachment.fileName,
    caption
  );
}
