// pi-dash's hooks for boat-kit's screen capturer: seeded logins, the policy
// gate, and what a settled page looks like. $SCENARIO default-exports the
// screens (README.md).
import type { BrowserContext, Page } from "@playwright/test";

// Logins created by scripts/seed.ts.
const LOGINS: Record<string, [string, string]> = {
  super_admin: ["admin@pi-dash.dev", "Admin123!"],
  admin: ["lead@pi-dash.dev", "Lead123!"],
  finance_admin: ["finance@pi-dash.dev", "Finance123!"],
  volunteer: ["volunteer1@pi-dash.dev", "Volunteer123!"],
  unoriented_volunteer: ["newbie@pi-dash.dev", "Newbie123!"],
};

async function signIn(context: BrowserContext, as: string) {
  const login = LOGINS[as];
  if (!login) {
    throw new Error(`no seeded login for ${as}`);
  }
  const [email, password] = login;
  const response = await context.request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`sign-in as ${as} failed: HTTP ${response.status()}`);
  }
}

// The seed puts policies in force that no seeded user has accepted, so the
// first visit lands on /accept-policies. Accepts them, as a user would.
async function acceptPolicies(page: Page, as?: string) {
  if (!as) {
    return false;
  }
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

// Signed-in pages wait for Zero (`data-zero-ready` on #main), then every page
// for its route spinner and skeletons to go. Vite dev compiles each route on
// its first visit, which can take most of a minute in a sandbox.
async function settle(page: Page, as?: string) {
  if (as) {
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

const { captureScreens } = await import(
  `${process.env.BOAT_KIT}/playwright-screens.ts`
);
const screens = (await import(process.env.SCENARIO ?? "")).default;
await captureScreens(screens, {
  afterLoad: acceptPolicies,
  baseURL: "http://localhost:3001",
  // The dev server's overlay buttons would sit in every shot.
  hide: ["[data-agentation-portal]", '[data-testid="tanstack_devtools"]'],
  settle,
  signIn,
});
