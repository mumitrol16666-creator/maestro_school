export function isSupportedMaterialUrl(value: string) {
  const input = value.trim();
  if (!input) return true;
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
