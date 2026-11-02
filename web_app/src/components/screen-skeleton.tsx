/**
 * В-15: while a student screen loads, grey placeholders of its cards stand where the
 * content will be; the header and the bottom navigation stay, nothing turns dark.
 */
export type ScreenSkeletonVariant = "page" | "home" | "list" | "detail" | "calendar" | "profile" | "chat" | "section";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`maestro-skeleton ${className}`} aria-hidden="true" />;
}

function Title({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-2">
      <SkeletonBlock className={`h-8 rounded-lg ${wide ? "w-64 max-w-full" : "w-44"}`} />
      <SkeletonBlock className="h-4 w-56 max-w-full rounded-md" />
    </div>
  );
}

function Row() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-paper p-4">
      <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-3/4 rounded-md" />
        <SkeletonBlock className="h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

function variantBody(variant: ScreenSkeletonVariant) {
  switch (variant) {
    case "home":
      return (
        <>
          <Title wide />
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <SkeletonBlock className="h-12 rounded-2xl" />
            <SkeletonBlock className="h-12 rounded-2xl" />
          </div>
          <SkeletonBlock className="h-48 rounded-[24px]" />
          <Row />
          <Row />
        </>
      );
    case "list":
      return (
        <>
          <Title />
          <div className="flex gap-2">
            <SkeletonBlock className="h-11 w-28 rounded-xl" />
            <SkeletonBlock className="h-11 w-28 rounded-xl" />
          </div>
          <Row />
          <Row />
          <Row />
          <Row />
        </>
      );
    case "detail":
      return (
        <>
          <SkeletonBlock className="h-5 w-32 rounded-md" />
          <Title wide />
          <SkeletonBlock className="h-40 rounded-[24px]" />
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-full rounded-md" />
            <SkeletonBlock className="h-4 w-11/12 rounded-md" />
            <SkeletonBlock className="h-4 w-2/3 rounded-md" />
          </div>
          <SkeletonBlock className="h-11 w-full rounded-xl sm:w-48" />
        </>
      );
    case "calendar":
      return (
        <>
          <Title />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, index) => <SkeletonBlock key={index} className="h-14 rounded-xl" />)}
          </div>
          <SkeletonBlock className="h-5 w-40 rounded-md" />
          <Row />
          <Row />
        </>
      );
    case "profile":
      return (
        <>
          <div className="flex items-center gap-4">
            <SkeletonBlock className="h-20 w-20 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-7 w-48 max-w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-32 rounded-md" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-11 w-24 rounded-xl" />
            <SkeletonBlock className="h-11 w-24 rounded-xl" />
            <SkeletonBlock className="h-11 w-24 rounded-xl" />
          </div>
          <SkeletonBlock className="h-36 rounded-[24px]" />
          <Row />
        </>
      );
    case "section":
      // Under a heading the screen already shows: only the cards.
      return (
        <>
          <SkeletonBlock className="h-36 rounded-[24px]" />
          <Row />
          <Row />
        </>
      );
    case "chat":
      return (
        <>
          <Title />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 py-1">
              <SkeletonBlock className="h-12 w-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-1/2 rounded-md" />
                <SkeletonBlock className="h-3 w-3/4 rounded-md" />
              </div>
            </div>
          ))}
        </>
      );
    default:
      return (
        <>
          <Title />
          <SkeletonBlock className="h-44 rounded-[24px]" />
          <Row />
          <Row />
        </>
      );
  }
}

export function ScreenSkeleton({
  variant = "page",
  label = "Загружаем",
  className = "",
}: {
  variant?: ScreenSkeletonVariant;
  /** Read by a screen reader only; the placeholders carry no text. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="screen-skeleton"
      className={`mx-auto w-full max-w-[1400px] space-y-4 ${className}`}
    >
      {variantBody(variant)}
      <span className="sr-only">{label}</span>
    </div>
  );
}
