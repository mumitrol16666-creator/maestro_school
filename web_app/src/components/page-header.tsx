export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="section-eyebrow mb-2 text-xs font-bold uppercase text-gold-ink">{eyebrow}</p>}
        <h1 className="font-display break-words text-balance text-[1.85rem] leading-tight sm:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>}
      </div>
      {action ? <div className="w-full min-w-0 sm:w-auto">{action}</div> : null}
    </header>
  );
}
