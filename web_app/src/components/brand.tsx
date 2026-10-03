import Link from "next/link";

export function Brand({ compact = false, href = "/dashboard" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-3 rounded-xl transition-opacity hover:opacity-90" aria-label="Maestro — музыкальная школа" translate="no">
      <img src="/brand/guitar-avatar.png" width={64} height={64} alt="" className="h-16 w-16 shrink-0 rounded-xl" />
      {!compact && (
        <span className="min-w-0">
          <span className="font-display block text-[23px] leading-none tracking-[0.035em]">MAESTRO</span>
          <span className="mt-2 block text-[9px] font-medium uppercase tracking-[0.24em] opacity-70">Music school</span>
        </span>
      )}
    </Link>
  );
}
