function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

export function isQaLanOrigin(origin: string, applicationPort = "3321") {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" || url.port !== applicationPort) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname.endsWith(".local")
      || isPrivateIpv4(hostname);
  } catch {
    return false;
  }
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  configuredOrigins: ReadonlySet<string>,
  qaLocal: boolean,
) {
  if (!origin) return true;
  return configuredOrigins.has(origin) || (qaLocal && isQaLanOrigin(origin));
}
