export function normalizePhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

export function whatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone;
}
