export function ProgressBar({ value, dark = false }: { value: number; dark?: boolean }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`overflow-hidden rounded-full ${dark ? "h-2 bg-white/12" : "h-1.5 bg-stone-200/90"}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${dark ? "bg-gradient-to-r from-gold/90 to-gold shadow-[0_0_12px_rgba(197,154,69,0.35)]" : "bg-gold"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
