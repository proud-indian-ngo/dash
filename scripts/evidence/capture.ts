// Screenshots the screens a shots file lists, for PR evidence. Run by
// `scripts/boat.sh verify` in a sandbox, against the dev app on :3001:
//
//   bun scripts/evidence/capture.ts <shots.ts> <out-dir> <before|after>
//
// A shots file default-exports `Shot[]` (./types). Each screen is captured on desktop and
// phone unless `viewports` says otherwise. A shot that fails is recorded in
// <out-dir>/manifest.json with its error, so one missing screen doesn't lose
// the rest; on the before side that is usually a screen the PR adds.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type Browser, chromium, devices } from "@playwright/test";

import type { Capture, Role, Shot, Viewport } from "./types";

const BASE_URL = "http://localhost:3001";

// Logins created by scripts/seed.ts.
const LOGINS: Record<Exclude<Role, "guest">, [string, string]> = {
  super_admin: ["admin@pi-dash.dev", "Admin123!"],
  admin: ["lead@pi-dash.dev", "Lead123!"],
  finance_admin: ["finance@pi-dash.dev", "Finance123!"],
  volunteer: ["volunteer1@pi-dash.dev", "Volunteer123!"],
  unoriented_volunteer: ["newbie@pi-dash.dev", "Newbie123!"],
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: devices["iPhone 13"],
};

async function capture(
  browser: Browser,
  shot: Shot,
  viewport: Viewport,
  outDir: string
): Promise<Capture> {
  const context = await browser.newContext({
    ...VIEWPORTS[viewport],
    baseURL: BASE_URL,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  try {
    const role = shot.as ?? "super_admin";
    if (role !== "guest") {
      const [email, password] = LOGINS[role];
      const response = await context.request.post("/api/auth/sign-in/email", {
        data: { email, password },
      });
      if (!response.ok()) {
        throw new Error(`sign-in as ${role} failed: HTTP ${response.status()}`);
      }
    }
    const page = await context.newPage();
    const response = await page.goto(shot.path, { waitUntil: "load" });
    if (response && response.status() >= 400) {
      throw new Error(`${shot.path} returned HTTP ${response.status()}`);
    }
    await page
      .locator('[data-slot="skeleton"]')
      .first()
      .waitFor({ state: "detached", timeout: 20_000 });
    await shot.prepare?.(page);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
      // Zero keeps a socket open, so the network may never go idle.
    });
    const file = `${shot.name}-${viewport}.png`;
    await page.screenshot({ fullPage: true, path: path.join(outDir, file) });
    return { file, name: shot.name, viewport };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message.split("\n")[0], name: shot.name, viewport };
  } finally {
    await context.close();
  }
}

const [shotsFile, outDir, side] = process.argv.slice(2);
if (!(shotsFile && outDir && (side === "before" || side === "after"))) {
  console.error(
    "Usage: bun scripts/evidence/capture.ts <shots.ts> <out-dir> <before|after>"
  );
  process.exit(1);
}
const shots: Shot[] = (await import(path.resolve(shotsFile))).default;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const captures: Capture[] = [];
for (const shot of shots) {
  if (side === "before" && shot.before === false) {
    continue;
  }
  for (const viewport of shot.viewports ?? ["desktop", "phone"]) {
    const result = await capture(browser, shot, viewport, outDir);
    console.log(
      `${side} ${shot.name} ${viewport}: ${result.error ?? result.file}`
    );
    captures.push(result);
  }
}
await browser.close();
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(captures, null, 2)
);
