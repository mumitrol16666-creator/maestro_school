import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-3 transition opacity-100 hover:opacity-90">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-gold/40 bg-ink text-sm font-bold text-gold shadow-[0_0_0_1px_rgba(197,154,69,0.15)]">
        M
      </span>
      {!compact && (
        <span>
          <span className="font-display block text-xl leading-none">Maestro</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-stone-400">Music school</span>
        </span>
      )}
    </Link>
  );
}
