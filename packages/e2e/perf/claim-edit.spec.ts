import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";
import { ReimbursementPage } from "../pages/reimbursement-page";

const OUTPUT = path.resolve(
  import.meta.dirname,
  `../../../tmp/web-vitals/followup/${process.env.PERFORMANCE_LABEL ?? "current"}`
);
const TITLE = "E2E Seed Reimbursement";
const DEVICES = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
] as const;

type Probe = { clickAt: number | null };
type ProbeWindow = typeof globalThis & { __claimEditProbe: Probe };

async function newPage(
  browser: Browser,
  baseURL: string,
  device: (typeof DEVICES)[number]
) {
  const context = await browser.newContext({
    baseURL,
    viewport: device.viewport,
    hasTouch: device.hasTouch,
    isMobile: device.isMobile,
    deviceScaleFactor: device.isMobile ? 3 : 1,
    storageState: path.resolve(
      import.meta.dirname,
      "../.auth/finance_admin.json"
    ),
  });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    (globalThis as ProbeWindow).__claimEditProbe = { clickAt: null };
    document.addEventListener(
      "click",
      () => {
        const probe = (globalThis as ProbeWindow).__claimEditProbe;
        probe.clickAt ??= performance.now();
      },
      true
    );
  });
  return { context, page };
}

async function arm(page: Page) {
  await page.evaluate(() => {
    (globalThis as ProbeWindow).__claimEditProbe.clickAt = null;
  });
}

async function metrics(page: Page, fromNavigation = false) {
  return page.evaluate((navigation) => {
    const start = navigation
      ? 0
      : (globalThis as ProbeWindow).__claimEditProbe.clickAt;
    if (start === null) throw new Error("No click captured");
    const resources = (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    )
      .filter(
        (entry) =>
          entry.startTime >= start &&
          new URL(entry.name).pathname.endsWith(".js")
      )
      .map((entry) => ({
        filename: new URL(entry.name).pathname,
        encodedBodyBytes: entry.encodedBodySize,
        startFromClickMs: entry.startTime - start,
        endFromClickMs: entry.responseEnd - start,
      }));
    return {
      readyMs: performance.now() - start,
      javaScriptBytes: resources.reduce(
        (sum, entry) => sum + entry.encodedBodyBytes,
        0
      ),
      resources,
    };
  }, fromNavigation);
}

async function expectEdit(page: Page) {
  const reimbursement = new ReimbursementPage(page, "reimbursement");
  await expect(reimbursement.form.getTitleInput()).toHaveValue(TITLE);
  await expect(reimbursement.form.getSubmitButton()).toBeEnabled();
  await expect(reimbursement.detail.getViewDetailsButton()).toBeVisible();
}

test("measure claim detail and main edit readiness", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(process.env.CLAIM_EDIT_PERFORMANCE !== "true");
  test.setTimeout(300_000);
  if (!baseURL) throw new Error("E2E base URL required");
  const samples: unknown[] = [];
  const errors: string[] = [];
  for (const device of DEVICES) {
    for (let run = 1; run <= 3; run += 1) {
      let context: BrowserContext | undefined;
      try {
        const opened = await newPage(browser, baseURL, device);
        context = opened.context;
        const page = opened.page;
        page.on("pageerror", (error) => errors.push(error.name));
        const reimbursement = new ReimbursementPage(page, "reimbursement");
        await reimbursement.navigateToList();
        const row = reimbursement.list
          .getTable()
          .getByRole("row")
          .filter({ hasText: TITLE });
        await expect(row).toBeVisible();
        await arm(page);
        await row.click();
        await reimbursement.waitForDetail(TITLE);
        await expect(
          reimbursement.detail.getEditSubmissionButton()
        ).toBeVisible();
        samples.push({
          device: device.name,
          run,
          phase: "detail",
          ...(await metrics(page)),
        });
        const detailPath = new URL(page.url()).pathname;

        await arm(page);
        await reimbursement.detail.editSubmission();
        await expectEdit(page);
        samples.push({
          device: device.name,
          run,
          phase: "first-edit",
          ...(await metrics(page)),
        });
        await reimbursement.detail.getViewDetailsButton().click();
        await reimbursement.waitForDetail(TITLE);
        await arm(page);
        await reimbursement.detail.editSubmission();
        await expectEdit(page);
        samples.push({
          device: device.name,
          run,
          phase: "repeat-edit",
          ...(await metrics(page)),
        });
        await context.close();
        context = undefined;

        const direct = await newPage(browser, baseURL, device);
        context = direct.context;
        direct.page.on("pageerror", (error) => errors.push(error.name));
        await direct.page.goto(`${detailPath}?mode=edit`);
        await expectEdit(direct.page);
        samples.push({
          device: device.name,
          run,
          phase: "direct-edit",
          ...(await metrics(direct.page, true)),
        });
      } finally {
        await context?.close();
      }
    }
  }
  await mkdir(OUTPUT, { recursive: true });
  const report = JSON.stringify(
    {
      methodology: {
        label: process.env.PERFORMANCE_LABEL ?? "current",
        cpuSlowdown: 4,
        downloadBitsPerSecond: 1_600_000,
        latencyMs: 150,
        role: "finance_admin",
        runs: 3,
        cache:
          "fresh context per detail/direct-edit; preserved for edit/repeat",
        readiness:
          "detail heading and Edit action; edit populated Title, enabled Save changes, View details",
        timings:
          "Captured click to assertions completed; direct-edit is document navigation to assertions completed",
      },
      samples,
      errors,
    },
    null,
    2
  );
  await writeFile(path.join(OUTPUT, "claim-edit.json"), report);
  await testInfo.attach("claim-edit", {
    body: report,
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
