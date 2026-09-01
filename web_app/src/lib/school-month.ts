export function aqtobeMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aqtobe",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftMonthKey(key: string, amount: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthKey(key: string, style: "long" | "short" = "long") {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: style, year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function recentMonthKeys(count = 18) {
  const current = aqtobeMonthKey();
  return Array.from({ length: count }, (_, index) => shiftMonthKey(current, -index));
}
