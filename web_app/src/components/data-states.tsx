import { AlertCircle, Inbox, Music2, RefreshCw } from "lucide-react";

export function LoadingState({ label = "Загружаем данные Maestro" }: { label?: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="maestro-loading-stage relative grid min-h-[390px] place-items-center overflow-hidden rounded-[30px] border border-white/10 bg-[#171813] p-8 text-center text-white shadow-2xl"
    >
      <div className="maestro-loading-glow maestro-loading-glow-left" aria-hidden="true" />
      <div className="maestro-loading-glow maestro-loading-glow-right" aria-hidden="true" />
      <div className="maestro-loading-staff" aria-hidden="true" />

      <div className="relative z-10 flex max-w-md flex-col items-center">
        <div className="maestro-loading-mark" aria-hidden="true">
          <span className="maestro-loading-orbit" />
          <span className="maestro-loading-orbit-dot" />
          <span className="maestro-loading-monogram">M</span>
          <Music2 className="maestro-loading-note" size={18} strokeWidth={2.3} />
        </div>

        <p className="mt-7 text-[10px] font-black uppercase tracking-[0.24em] text-gold">
          Цифровая школа Maestro
        </p>
        <h2 className="font-display mt-3 text-2xl leading-tight sm:text-3xl">{label}</h2>

        <div className="maestro-loading-equalizer mt-7" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="mt-4 text-xs font-semibold text-white/45">Настраиваем всё для вашего занятия</p>
        <span className="sr-only">Загрузка</span>
      </div>
    </section>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-[30px] border border-stone-200 bg-paper p-8 text-center shadow-soft">
      <div className="max-w-md">
        <AlertCircle className="mx-auto text-gold" />
        <h2 className="font-display mt-4 text-3xl">Не удалось загрузить данные</h2>
        <p className="mt-3 text-sm leading-6 text-stone-500">{message}</p>
        {retry && <button onClick={retry} className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"><RefreshCw size={15} /> Повторить</button>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-[30px] border border-stone-200 bg-paper p-8 text-center shadow-soft">
      <div className="max-w-md"><Inbox className="mx-auto text-gold" /><h2 className="font-display mt-4 text-3xl">{title}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{description}</p>{action && <div className="mt-6">{action}</div>}</div>
    </div>
  );
}
