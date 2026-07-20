import { Download, ShieldCheck, Smartphone } from "lucide-react";

export const ANDROID_APK_URL = "/downloads/maestro-school.apk";

export function AndroidAppDownloadCard() {
  return (
    <section className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-soft sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-white">
          <Smartphone size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-emerald-800">Приложение для Android</p>
          <h3 className="font-display mt-2 text-3xl text-ink">Maestro на телефоне</h3>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Скачайте установочный файл и откройте его на Android. После установки Maestro появится среди приложений.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={ANDROID_APK_URL}
              download="maestro-school.apk"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white transition hover:bg-emerald-900"
            >
              <Download size={17} />
              Скачать APK
            </a>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-900/70">
              <ShieldCheck size={15} />
              Официальная сборка Maestro
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AndroidAppDownloadLink() {
  return (
    <a
      href={ANDROID_APK_URL}
      download="maestro-school.apk"
      className="mt-4 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-100"
    >
      <Download size={17} />
      Скачать приложение для Android
    </a>
  );
}
