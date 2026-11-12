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

import { type Browser, chromium, devices, type Page } from "@playwright/test";

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

// Waits until the page shows data: signed-in pages until Zero has connected
// (`data-zero-ready` on #main), then every page until no route spinner or
// skeleton is left. Vite dev compiles each route on its first visit, which
// can take most of a minute in a sandbox.
async function settle(page: Page, role: Role) {
  if (role !== "guest") {
    await page.locator("#main[data-zero-ready]").waitFor({ timeout: 90_000 });
  }
  for (const selector of ['output[role="status"]', '[data-slot="skeleton"]']) {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: "detached", timeout: 30_000 });
  }
  await page.waitForTimeout(500);
}

// The seed puts policies in force that no seeded user has accepted, so the
// first visit lands on /accept-policies. Accepts them, as a user would.
// Returns whether it did.
async function acceptPolicies(page: Page) {
  const gate = page.getByRole("heading", { name: "Before you continue" });
  await page
    .locator("#main[data-zero-ready]")
    .or(gate)
    .first()
    .waitFor({ timeout: 90_000 });
  if (!(await gate.isVisible())) {
    return false;
  }
  await page
    .getByRole("checkbox", { name: "I have read and accept these policies" })
    .check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname !== "/accept-policies");
  return true;
}

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
    if (role !== "guest" && (await acceptPolicies(page))) {
      await page.goto(shot.path, { waitUntil: "load" });
    }
    await settle(page, role);
    if (shot.prepare) {
      await shot.prepare(page);
      await settle(page, role);
    }
    const file = `${shot.name}-${viewport}.png`;
    await page.screenshot({
      fullPage: shot.fullPage ?? false,
      path: path.join(outDir, file),
      // The dev server's overlay buttons would sit in every shot.
      style:
        '[data-agentation-portal], [data-testid="tanstack_devtools"] { display: none !important; }',
    });
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
