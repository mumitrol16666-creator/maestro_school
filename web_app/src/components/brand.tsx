import Link from "next/link";

export function Brand({ compact = false, href = "/dashboard" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3 transition hover:opacity-90" aria-label="Maestro">
      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-violet-300/35 bg-[#24134F] shadow-[0_12px_30px_rgba(36,19,79,0.26),inset_0_1px_0_rgba(255,255,255,0.09)]">
        <svg viewBox="0 0 44 44" aria-hidden="true" className="h-11 w-11">
          <rect width="44" height="44" rx="14" fill="#24134F" />
          <path d="M9 29.5c4.4-7.6 7.2-16 13-16s8.6 8.4 13 16" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M14 28V15.5l8 9.2 8-9.2V28" fill="none" stroke="#EDE9FE" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31.5 12.2v10.2" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
          <circle cx="28.7" cy="24.4" r="3.2" fill="#8B5CF6" />
          <path d="M31.5 12.2c2.8.2 4.5 1.2 5.5 2.9" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="font-display block text-[21px] leading-none tracking-normal">Maestro</span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] text-stone-400">Music school</span>
        </span>
      )}
    </Link>
  );
}
