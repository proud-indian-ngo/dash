export function formatPhoneForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, "");
}
