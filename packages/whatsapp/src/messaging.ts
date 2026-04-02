import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);

  const response = await fetch(`${apiUrl}/send/message`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone: formatted,
      message,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppGroupMessage(
  groupJid: string,
  message: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const response = await fetch(`${apiUrl}/send/message`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({ phone: groupJid, message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group message error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const response = await fetch(`${apiUrl}/send/image`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      image: { url: imageUrl },
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp image error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppVideo(
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const response = await fetch(`${apiUrl}/send/video`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      video: { url: videoUrl },
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp video error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppDocument(
  phone: string,
  documentUrl: string,
  fileName: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const response = await fetch(`${apiUrl}/send/document`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      document: { url: documentUrl },
      fileName,
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp document error ${response.status}: ${text}`);
  }
}

export interface WhatsAppMediaAttachment {
  fileName: string;
  mimeType: string;
  url: string;
}

export async function sendWhatsAppMedia(
  phone: string,
  attachment: WhatsAppMediaAttachment,
  caption?: string
): Promise<void> {
  if (attachment.mimeType.startsWith("image/")) {
    await sendWhatsAppImage(phone, attachment.url, caption);
  } else if (attachment.mimeType.startsWith("video/")) {
    await sendWhatsAppVideo(phone, attachment.url, caption);
  } else {
    await sendWhatsAppDocument(
      phone,
      attachment.url,
      attachment.fileName,
      caption
    );
  }
}
