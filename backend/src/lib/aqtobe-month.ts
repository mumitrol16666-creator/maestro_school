const AQTOBE_TIME_ZONE = "Asia/Aqtobe";

export function aqtobeMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: AQTOBE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Не удалось определить текущий месяц школы");
  }
  return `${year}-${month}`;
}
