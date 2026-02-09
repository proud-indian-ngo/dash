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
