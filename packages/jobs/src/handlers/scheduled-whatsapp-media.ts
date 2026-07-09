import type { WhatsAppMediaAttachment } from "@pi-dash/whatsapp/messaging";

interface ScheduledAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

interface R2Presigner {
  presign: (
    key: string,
    options: { expiresIn: number; method: "GET" }
  ) => string;
}

export function buildScheduledWhatsAppMedia(
  attachments: ScheduledAttachment[],
  r2: R2Presigner
): WhatsAppMediaAttachment[] {
  return attachments.map((attachment) => ({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    url: r2.presign(attachment.r2Key, {
      expiresIn: 900,
      method: "GET",
    }),
  }));
}
