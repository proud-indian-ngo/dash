import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

const execFileAsync = promisify(execFile);
const goliveHelperPath = path.resolve(
  import.meta.dirname,
  "kalakriti-golive.ts"
);

const lifecycleLabels = {
  archived: "archived",
  draft: "draft",
  live: "live",
  registration_locked: "registration locked",
  registration_open: "registration open",
} as const;

type KalakritiLifecycle = keyof typeof lifecycleLabels;

export async function runKalakritiGoliveFixture<T>(action: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", goliveHelperPath, action],
    {
      env: process.env,
      killSignal: "SIGKILL",
      timeout: 30_000,
    }
  );
  return JSON.parse(stdout.trim()) as T;
}

export async function waitForKalakritiLifecycle(
  page: Page,
  year: number,
  lifecycle: KalakritiLifecycle
): Promise<void> {
  const label = lifecycleLabels[lifecycle];
  await expect(async () => {
    await page.goto(`/kalakriti/${year}`);
    await waitForZeroReady(page);
    await expect(page.getByText(label, { exact: true })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 60_000 });
}

export async function prepareKalakriti2186EventDay(page: Page): Promise<void> {
  await runKalakritiGoliveFixture("prepare-2186-event-day");
  await waitForKalakritiLifecycle(page, 2186, "live");
}

export async function expectKalakritiToast(
  page: Page,
  message: string | RegExp
): Promise<void> {
  await expect(
    page.locator("[data-sonner-toast]").getByText(message)
  ).toBeVisible();
}
