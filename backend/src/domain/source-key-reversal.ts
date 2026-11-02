/**
 * Keys of reward rows that are reversed. The original row keeps its history but gives up its
 * canonical key (`<key>:reversed:v<n>`) so the same source can be awarded again; the negative
 * correction row takes `<key>:reversal:v<n>`.
 */
export function reversedKey(sourceKey: string, version: number) {
  return `${sourceKey}:reversed:v${version}`;
}

export function reversalKey(sourceKey: string, version: number) {
  return `${sourceKey}:reversal:v${version}`;
}

/**
 * The renamed key of a reversed row must stay unique. Keys that are not bound to one lesson
 * (homework recipient, topic mastery, plan completion) can be awarded again and reversed again
 * under the same version, so the rename takes the first free suffix: `:reversed:v1`, `:reversed:v1-2`…
 */
export async function freeReversedKey(
  exists: (candidate: string) => Promise<boolean>,
  sourceKey: string,
  version: number,
) {
  const base = reversedKey(sourceKey, version);
  let candidate = base;
  for (let attempt = 2; await exists(candidate); attempt += 1) {
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}
