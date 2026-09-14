import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

test("profile populated Audit Log SQL and authenticated reads", async ({
  request,
  playwright,
  page,
}, info) => {
  test.skip(
    process.env.AUDIT_PERFORMANCE !== "true" ||
      info.project.name !== "super_admin",
    "Opt-in isolated database benchmark"
  );
  test.setTimeout(180_000);
  const run = () =>
    execFileAsync(
      "bun",
      [
        "run",
        path.resolve(
          import.meta.dirname,
          "../../helpers/profile-audit-performance.ts"
        ),
      ],
      { env: process.env, timeout: 90_000 }
    );
  const report = JSON.parse((await run()).stdout.trim()) as {
    fixtureRows: number;
    results: {
      name: string;
      params: Record<string, string | number>;
      total: number;
      plans: unknown[];
    }[];
  };
  const repeated = JSON.parse((await run()).stdout.trim());
  expect(repeated.fixtureRows).toBe(report.fixtureRows);
  expect(repeated.results.map((item: { total: number }) => item.total)).toEqual(
    report.results.map((item) => item.total)
  );
  const http = [];
  for (const scenario of report.results) {
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      const start = performance.now();
      const response = await request.get("/api/audit-log", {
        params: scenario.params,
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      samples.push(performance.now() - start);
      expect(body.total).toBe(scenario.total);
      expect(body.entries).toHaveLength(
        Math.max(
          0,
          Math.min(20, scenario.total - Number(scenario.params.offset ?? 0))
        )
      );
      expect(body.facets.actions).toContain("benchmark.action.0");
      expect(body.facets.targetTypes).toContain("benchmark-type-0");
    }
    http.push({ name: scenario.name, elapsedMs: samples });
  }
  const restricted = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    ),
  });
  try {
    expect((await restricted.get("/api/audit-log")).status()).toBe(403);
  } finally {
    await restricted.dispose();
  }
  const initialResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/audit-log"
  );
  await page.goto("/audit-log");
  expect((await initialResponse).status()).toBe(200);
  const searchInput = page.getByRole("textbox", {
    name: "Search actor, action, or target...",
  });
  await expect(searchInput).toBeVisible();
  const secondPage = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/audit-log" &&
      new URL(response.url()).searchParams.get("offset") === "20"
  );
  await page
    .getByRole("button", { name: "Go to next page", exact: true })
    .click();
  expect((await secondPage).status()).toBe(200);
  await expect(page).toHaveURL(/page=2/);
  const searches: { search: string | null; offset: string | null }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/audit-log")
      searches.push({
        search: url.searchParams.get("search"),
        offset: url.searchParams.get("offset"),
      });
  });
  const searched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/audit-log" &&
      new URL(response.url()).searchParams.get("search") ===
        "benchmark-target-1234"
  );
  await searchInput.pressSequentially("benchmark-target-1234", { delay: 10 });
  expect((await searched).status()).toBe(200);
  expect(searches).toEqual([{ search: "benchmark-target-1234", offset: "0" }]);
  await info.attach("audit-performance.json", {
    body: JSON.stringify({ ...report, http }),
    contentType: "application/json",
  });
});
