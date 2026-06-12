import { MessageCircle } from "lucide-react";
import { formatPhoneDisplay, whatsAppUrl } from "@/lib/phone";

export function WhatsAppLink({
  phone,
  label = "WhatsApp",
  className = "",
}: {
  phone: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const url = whatsAppUrl(phone);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 ${className}`}
    >
      <MessageCircle size={16} />
      {label}
    </a>
  );
}

export function StudentPhoneLine({
  phone,
  login,
  email,
}: {
  phone: string | null | undefined;
  login?: string | null;
  email?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-lg font-bold text-ink">{formatPhoneDisplay(phone)}</p>
      {login ? <p className="text-sm text-stone-500">Логин: {login}</p> : null}
      {email ? <p className="text-xs text-stone-400">{email}</p> : null}
    </div>
  );
}
