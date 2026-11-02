"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import type { BackTarget } from "@/lib/student-back";

export type BackTargetOverride = { pathname: string; target: BackTarget } | null;

/** Set by the shell; a page that knows its parent better than the route table reports it here. */
export const BackTargetContext = createContext<((override: BackTargetOverride) => void) | null>(null);

/** A screen whose parent depends on its data (a course lesson → its course) names it for the header «назад». */
export function usePageBackTarget(target: BackTarget | null) {
  const setOverride = useContext(BackTargetContext);
  const pathname = usePathname();
  const href = target?.href;
  const label = target?.label;

  useEffect(() => {
    if (!setOverride || !href || !label) return;
    setOverride({ pathname, target: { href, label } });
    return () => setOverride(null);
  }, [setOverride, pathname, href, label]);
}

/**
 * В-7: the one «назад» of the student's screens — an arrow in a 44 px circle and the parent's
 * name in 14 px. The shell puts it in the left corner of the header; outside the shell (the
 * sign-up screens, the full-screen dialog) the screen puts it in its own top-left corner.
 */
export function BackButton({
  href,
  onClick,
  label,
  hideLabel = false,
  className = "",
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  /** Only the circle; the name stays for the screen reader. */
  hideLabel?: boolean;
  className?: string;
}) {
  const classes = `inline-flex min-h-11 min-w-11 max-w-full shrink-0 items-center gap-2 rounded-full text-sm font-bold text-ink transition-colors hover:text-gold-ink ${hideLabel ? "" : "pr-2"} ${className}`;
  const content = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink shadow-sm">
        <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
      </span>
      {hideLabel ? null : <span className="min-w-0 truncate">{label}</span>}
    </>
  );
  const name = hideLabel ? label : `Назад: ${label}`;

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={name} data-testid="back-button">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-label={name} data-testid="back-button">
      {content}
    </button>
  );
}
