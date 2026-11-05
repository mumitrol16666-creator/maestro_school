"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiRequest } from "@/lib/api-client";

type Certificate = { id: string; number: string; studentName: string; direction: string; sectorNumber: number; programTitle: string; examinerName: string; issuedAt: string; examAt: string };

export default function CertificatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <p className="p-6 text-base">Открываем сертификат…</p>;
  return <CertificateView />;
}

function CertificateView() {
  const { examId } = useParams<{ examId: string }>();
  const resource = useApiResource(() => apiRequest<Certificate>(`/sector-certificates/${encodeURIComponent(examId)}`), [examId]);
  const certificate = resource.data;
  if (!certificate) return <main className="mx-auto max-w-2xl p-6 text-base">{resource.error ?? "Открываем сертификат…"}{resource.error ? <button type="button" className="ml-3 min-h-11 underline" onClick={() => void resource.reload()}>Повторить</button> : null}</main>;
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Aqtobe" }).format(new Date(certificate.issuedAt));
  return <main className="certificate-page">
    <div className="certificate-toolbar">
      <button type="button" onClick={() => window.history.back()}>Назад</button>
      <button type="button" onClick={() => window.print()}><Printer size={18} /> Сохранить PDF или распечатать</button>
    </div>
    <article data-certificate-print className="certificate-sheet" aria-label={`Сертификат ${certificate.studentName}`}>
      <div className="certificate-brand">MAESTRO <span>MUSIC SCHOOL</span></div>
      <p className="certificate-eyebrow">Подтверждение освоения программы</p>
      <h1>Сертификат</h1>
      <p className="certificate-intro">Выдан</p>
      <p className="certificate-name">{certificate.studentName}</p>
      <p className="certificate-description">за успешную сдачу экзамена по направлению</p>
      <p className="certificate-direction">{certificate.direction} · сектор {certificate.sectorNumber}</p>
      <p className="certificate-program">{certificate.programTitle}</p>
      <div className="certificate-footer">
        <div><p>Экзаменатор</p><strong>{certificate.examinerName || "Maestro Music School"}</strong></div>
        <div><p>{date}</p><strong>№ {certificate.number}</strong></div>
      </div>
    </article>
    <style jsx>{`
      .certificate-page { min-height:100vh; padding:24px; background:#eeeae1; color:#1d1b18; }
      .certificate-toolbar { max-width:1120px; margin:0 auto 20px; display:flex; gap:12px; flex-wrap:wrap; justify-content:space-between; }
      .certificate-toolbar button { min-height:44px; display:inline-flex; align-items:center; gap:8px; padding:10px 18px; background:#1d1b18; color:#fff; border-radius:12px; font-size:14px; }
      .certificate-sheet { box-sizing:border-box; max-width:1120px; margin:auto; padding:48px 64px 40px; border:3px solid #bb9442; outline:1px solid #bb9442; outline-offset:-14px; background:#fffdf7; text-align:center; }
      .certificate-brand { font-family:var(--font-playfair),serif; font-weight:700; font-size:28px; letter-spacing:5px; }
      .certificate-brand span { display:block; margin-top:4px; font-family:var(--font-inter),sans-serif; font-size:10px; letter-spacing:4px; }
      .certificate-eyebrow { margin:28px 0 8px; text-transform:uppercase; letter-spacing:3px; font-size:11px; color:#735c2a; }
      h1 { margin:0; font-family:var(--font-playfair),serif; font-size:64px; line-height:1.15; }
      .certificate-intro { margin:24px 0 8px; font-size:16px; color:#6b6559; }
      .certificate-name { margin:0; font-family:var(--font-playfair),serif; font-size:38px; line-height:1.3; overflow-wrap:anywhere; }
      .certificate-description { margin:24px 0 8px; font-size:17px; color:#6b6559; }
      .certificate-direction { margin:0; font-size:26px; font-weight:700; }
      .certificate-program { margin:12px 0 0; font-size:17px; color:#6b6559; }
      .certificate-footer { display:flex; gap:24px; flex-wrap:wrap; justify-content:space-between; text-align:left; margin-top:48px; font-size:13px; line-height:1.8; }
      .certificate-footer p { color:#6b6559; }
      @media(max-width:640px) { .certificate-page{padding:12px}.certificate-sheet{padding:36px 22px}.certificate-name{font-size:28px}h1{font-size:42px}.certificate-direction{font-size:21px}.certificate-footer{margin-top:32px} }
      @media print { .certificate-page{padding:0;background:white;min-height:auto}.certificate-toolbar{display:none}.certificate-sheet{max-width:none;width:100%;padding:12mm 16mm 10mm;break-inside:avoid;box-shadow:none}h1{font-size:50px}.certificate-eyebrow{margin-top:18px}.certificate-footer{margin-top:28px}.certificate-name{font-size:32px} }
      @page { size:A4 landscape; margin:12mm; }
    `}</style>
  </main>;
}
