const AQTOBE_TIME_ZONE = "Asia/Aqtobe";

export function currentAqtobeMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: AQTOBE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}
