"use client";

export function AdminPendingHomeworkBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold leading-none text-ink">
      {label}
    </span>
  );
}
