import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/public-events-feed.ts"
);

async function fixture<T>(action: "cleanup" | "setup", argument?: string) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface FeedEvent {
  area: string;
  id: string;
  name: string;
  occurrenceDate: string;
  signUpUrl: string;
  startTime: string;
  summary: string;
  team: string;
}

const ALLOWED_KEYS = [
  "area",
  "city",
  "endTime",
  "id",
  "name",
  "occurrenceDate",
  "programme",
  "signUpUrl",
  "startTime",
  "summary",
  "team",
];

test.describe("Public events API", () => {
  test.describe.configure({ mode: "serial" });

  test("serves only public, upcoming sessions with coarse areas and no PII", async ({
    request,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for the public feed fixture");
    }
    const fx = await fixture<{
      ids: Record<string, string>;
      movedStart: string;
      skippedDate: string;
      teamName: string;
      virtualDate: string;
    }>("setup", creatorEmail);

    try {
      // A query no other spec uses, so the 60s server cache starts empty.
      const response = await request.get(
        "/api/public/events?days=29&limit=50",
        { headers: { Origin: "https://proudindian.ngo" } }
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["access-control-allow-origin"]).toBe(
        "https://proudindian.ngo"
      );
      expect(response.headers()["cache-control"]).toBe(
        "public, max-age=300, stale-while-revalidate=3600"
      );

      const body = (await response.json()) as { events: FeedEvent[] };
      const ours = body.events.filter((e) =>
        e.name.startsWith("Public feed E2E")
      );
      const raw = JSON.stringify(ours);

      // Allow-listed fields only; never the raw location or contact details.
      for (const event of ours) {
        expect(
          Object.keys(event).every((key) => ALLOWED_KEYS.includes(key))
        ).toBe(true);
      }
      expect(raw).not.toContain("Secret Road");
      expect(raw).not.toContain("maps.google.com");
      expect(raw).not.toContain("98765");

      const ids = new Set(ours.map((e) => e.id));
      for (const excluded of ["cancelled", "kalakriti", "mumbai", "private"]) {
        expect(ids.has(fx.ids[excluded] ?? "")).toBe(false);
      }

      const listed = ours.find((e) => e.id === fx.ids.listed);
      expect(listed).toMatchObject({
        area: "Iblur, Bengaluru",
        summary: "Help with maths. Call.",
        team: fx.teamName,
      });
      expect(new URL(listed?.signUpUrl ?? "").search).toBe(
        `?interestEventId=${fx.ids.listed}`
      );

      // The moved session is listed on its own row at its new time; the
      // cancelled one is gone; later sessions expand from the RRULE.
      expect(ours.find((e) => e.id === fx.ids.moved)?.startTime).toBe(
        fx.movedStart
      );
      const seriesDates = ours
        .filter((e) => e.id === fx.ids.series)
        .map((e) => new URL(e.signUpUrl).searchParams.get("occDate"));
      expect(seriesDates).toContain(fx.virtualDate);
      expect(seriesDates).not.toContain(fx.skippedDate);
      expect(ours.find((e) => e.id === fx.ids.series)?.area).toBe(
        "HSR Layout, Bengaluru"
      );

      // Sorted by start time.
      const starts = body.events.map((e) => Date.parse(e.startTime));
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    } finally {
      await fixture("cleanup");
    }
  });

  test("refuses writes and far-future windows", async ({ request }) => {
    expect((await request.post("/api/public/events")).status()).toBe(405);
    expect(
      (await request.get("/api/public/events?from=9999-01-01")).status()
    ).toBe(400);
  });
});
