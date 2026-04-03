import { createRequestLogger } from "evlog";
import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<void> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppMessage",
  });
  log.set({ phone });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);

  const response = await fetch(`${apiUrl}/send/message`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({ phone: formatted, message }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp API error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  log.set({ event: "message_sent" });
  log.emit();
}

export async function sendWhatsAppGroupMessage(
  groupJid: string,
  message: string
): Promise<void> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppGroupMessage",
  });
  log.set({ groupJid });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return;
  }

  const response = await fetch(`${apiUrl}/send/message`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({ phone: groupJid, message }),
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

  log.set({ event: "message_sent" });
  log.emit();
}

export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppImage",
  });
  log.set({ phone, imageUrl });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return;
  }

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("image_url", imageUrl);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/image`, {
    method: "POST",
    headers: getWhatsAppHeaders({ omitContentType: true }),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp image error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  log.set({ event: "image_sent" });
  log.emit();
}

export async function sendWhatsAppVideo(
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<void> {
  const log = createRequestLogger({
    method: "POST",
    path: "sendWhatsAppVideo",
  });
  log.set({ phone, videoUrl });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return;
  }

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("video_url", videoUrl);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/video`, {
    method: "POST",
    headers: getWhatsAppHeaders({ omitContentType: true }),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp video error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  log.set({ event: "video_sent" });
  log.emit();
}

export async function sendWhatsAppFile(
  phone: string,
  fileUrl: string,
  caption?: string
): Promise<void> {
  const log = createRequestLogger({ method: "POST", path: "sendWhatsAppFile" });
  log.set({ phone, fileUrl });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return;
  }

  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    const error = new Error(
      `Failed to download file ${fileResponse.status}: ${fileUrl}`
    );
    log.error(error);
    log.emit();
    throw error;
  }

  const blob = await fileResponse.blob();
  const fileName = fileUrl.split("/").pop() ?? "file";

  const formData = new FormData();
  formData.append("phone", phone);
  formData.append("file", blob, fileName);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/send/file`, {
    method: "POST",
    headers: getWhatsAppHeaders({ omitContentType: true }),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`WhatsApp file error ${response.status}: ${text}`);
    log.error(error);
    log.emit();
    throw error;
  }

  log.set({ event: "file_sent" });
  log.emit();
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
): Promise<void> {
  if (WAPI_IMAGE_TYPES.has(attachment.mimeType)) {
    await sendWhatsAppImage(phone, attachment.url, caption);
  } else if (attachment.mimeType.startsWith("video/")) {
    await sendWhatsAppVideo(phone, attachment.url, caption);
  } else {
    await sendWhatsAppFile(phone, attachment.url, caption);
  }
}
