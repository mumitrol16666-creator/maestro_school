"use client";

export function AdminPendingHomeworkBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-ink">
      {label}
    </span>
  );
}
