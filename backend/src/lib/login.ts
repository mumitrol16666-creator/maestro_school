export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLogin(value: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(normalizeLogin(value));
}
