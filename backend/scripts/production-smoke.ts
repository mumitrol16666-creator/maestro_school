/** Read-only production smoke. It must never create or mutate application data. */
export {};

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "https://maestro-school.duckdns.org").replace(/\/$/, "");
const API_BASE_URL = (process.env.SMOKE_API_BASE_URL ?? BASE_URL).replace(/\/$/, "");
const WEB_BASE_URL = (process.env.SMOKE_WEB_BASE_URL ?? BASE_URL).replace(/\/$/, "");

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchText(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "text/html,application/json" },
  });
  const text = await response.text();
  assert(response.ok, `GET ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const health = JSON.parse(await fetchText(API_BASE_URL, "/health")) as {
    status?: string;
    database?: string;
    releaseSha?: string;
  };
  assert(health.status === "ok" && health.database === "ok", "API or database health is not OK");
  assert(/^[0-9a-f]{40}$/.test(health.releaseSha ?? ""), "health.releaseSha is missing or invalid");

  const loginHtml = await fetchText(WEB_BASE_URL, "/login");
  const releaseMeta = loginHtml.match(
    /<meta[^>]+name=["']maestro-release["'][^>]+content=["']([^"']+)["']/i,
  ) ?? loginHtml.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']maestro-release["']/i,
  );
  assert(releaseMeta?.[1] === health.releaseSha, "frontend and backend release SHA do not match");

  const directions = JSON.parse(await fetchText(API_BASE_URL, "/api/v1/directions")) as { data?: unknown[] };
  assert(Array.isArray(directions.data), "directions response has an invalid contract");

  const courses = JSON.parse(await fetchText(API_BASE_URL, "/api/v1/courses")) as {
    data?: { completionCoinsReward?: unknown }[];
  };
  assert(Array.isArray(courses.data), "courses response has an invalid contract");
  for (const course of courses.data) {
    assert(
      Number.isInteger(course.completionCoinsReward)
        && Number(course.completionCoinsReward) >= 0,
      "course completionCoinsReward is missing or invalid",
    );
  }

  console.log(`Production smoke passed for release ${health.releaseSha}.`);
}

main().catch((error) => {
  console.error("PRODUCTION SMOKE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
