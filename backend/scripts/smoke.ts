/**
 * Lightweight production smoke test. Requires a running API.
 */
export {};

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;

async function request<T>(method: string, path: string, token?: string, body?: unknown, expected = 200): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (response.status !== expected) {
    throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${payload.error?.message}`);
  }
  return payload.data as T;
}

async function main() {
  const healthResponse = await fetch(`${BASE_URL}/health`);
  const health = await healthResponse.json() as { status: string; database: string };
  if (!healthResponse.ok || health.status !== "ok" || health.database !== "ok") {
    throw new Error("Health check or PostgreSQL connection failed");
  }

  const suffix = Date.now();
  const registration = await request<{ token: string; user: { role: string } }>("POST", "/auth/register", undefined, {
    firstName: "Smoke",
    lastName: "Student",
    email: `smoke-${suffix}@maestro.test`,
    password: `student-${suffix}`,
  }, 201);
  if (registration.user.role !== "student") throw new Error("Registration returned a non-student role");

  await request("GET", "/auth/me", registration.token);
  await request("GET", "/directions", registration.token);
  await request("GET", "/courses", registration.token);
  await request("GET", "/news", registration.token);
  await request("GET", "/students/me/dashboard", registration.token);
  await request("GET", "/students/me/progress", registration.token);
  console.log("Smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
