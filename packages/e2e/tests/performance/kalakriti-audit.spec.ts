import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

test("profile scoped Kalakriti audit reads at scale", async ({
  playwright,
}, info) => {
  test.skip(
    process.env.KALAKRITI_AUDIT_PERFORMANCE !== "true" ||
      info.project.name !== "super_admin",
    "Opt-in isolated benchmark"
  );
  test.setTimeout(180_000);
  const run = () =>
    execFileAsync(
      "bun",
      [
        "run",
        path.resolve(
          import.meta.dirname,
          "../../helpers/profile-kalakriti-audit.ts"
        ),
      ],
      { env: process.env, timeout: 90_000 }
    );
  const report = JSON.parse((await run()).stdout.trim()) as {
    year: number;
    fixtureRows: number;
    results: {
      actor: string;
      scenario: string;
      domain: string | null;
      offset: number;
      total: number;
      expectedIds: string[];
    }[];
  };
  const repeated = JSON.parse((await run()).stdout.trim());
  expect(repeated.results.map((row: { total: number }) => row.total)).toEqual(
    report.results.map((row) => row.total)
  );
  const http = [];
  for (const actor of ["super_admin", "edition_admin", "category_lead"]) {
    const context = await playwright.request.newContext({
      baseURL: info.project.use.baseURL,
      storageState: path.resolve(
        import.meta.dirname,
        actor === "super_admin"
          ? "../../.auth/super_admin.json"
          : `../../.auth/kalakriti_${actor}.json`
      ),
    });
    try {
      for (const scenario of report.results.filter(
        (row) => row.actor === actor
      )) {
        const params: Record<string, string | number> = {
          limit: 25,
          offset: scenario.offset,
        };
        if (scenario.domain) params.domain = scenario.domain;
        const samples = [];
        let snapshotVersion: string | undefined;
        for (let sample = 0; sample < 3; sample++) {
          const started = performance.now();
          const response = await context.get(
            `/api/kalakriti/${report.year}/audit`,
            {
              params: {
                ...params,
                ...(snapshotVersion ? { snapshotVersion } : {}),
              },
            }
          );
          expect(response.status()).toBe(200);
          const body = await response.json();
          samples.push(performance.now() - started);
          expect(body.total).toBe(scenario.total);
          expect(body.items.map((row: { id: string }) => row.id)).toEqual(
            scenario.expectedIds
          );
          if (snapshotVersion)
            expect(body.snapshotVersion).toBe(snapshotVersion);
          snapshotVersion = body.snapshotVersion;
          if (actor === "category_lead") {
            expect(body.allowedDomains).toEqual([
              "competition_configuration",
              "schedule_configuration",
            ]);
          }
        }
        http.push({ actor, scenario: scenario.scenario, elapsedMs: samples });
      }
      if (actor === "category_lead") {
        expect(
          (
            await context.get(
              `/api/kalakriti/${report.year}/audit?domain=student_registration`
            )
          ).status()
        ).toBe(403);
      }
    } finally {
      await context.dispose();
    }
  }
  await info.attach("kalakriti-audit-performance.json", {
    body: JSON.stringify({ ...report, http }),
    contentType: "application/json",
  });
});
