import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingState({ label = "Загружаем данные Maestro" }: { label?: string }) {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-[30px] border border-stone-200 bg-paper p-8 text-center shadow-soft">
      <div><LoaderCircle className="mx-auto animate-spin text-gold" /><p className="mt-4 text-sm font-bold">{label}</p></div>
    </div>
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
