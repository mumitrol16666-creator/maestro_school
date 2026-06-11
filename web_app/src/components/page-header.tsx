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
    <header className="mb-8 flex flex-col gap-5 border-b border-stone-200/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="section-eyebrow mb-2 text-xs font-bold uppercase text-gold">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}
