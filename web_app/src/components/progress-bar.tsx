export function ProgressBar({ value, dark = false }: { value: number; dark?: boolean }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-stone-200"}`}>
      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
