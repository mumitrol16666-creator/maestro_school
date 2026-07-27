import { LoadingState } from "@/components/data-states";

export default function GlobalLoading() {
  return (
    <main className="min-h-screen bg-cream p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px]">
        <LoadingState label="Открываем Maestro" />
      </div>
    </main>
  );
}
