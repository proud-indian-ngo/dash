import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  request as playwrightRequest,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const VOLUNTEER_STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../../.auth/volunteer.json"
);
const requestedRuns = Number.parseInt(
  process.env.EXPORT_SSR_PERFORMANCE_RUNS ?? "",
  10
);
const EXPORT_SSR_RUNS = requestedRuns > 0 ? requestedRuns : 3;
const WARM_RELOAD = process.env.EXPORT_SSR_RETURNING === "true";
const MOBILE = {
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  viewport: { height: 844, width: 390 },
} as const;
const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

type ExportHydrationProbe = {
  capturedWhileLoading: boolean;
  containerRemovalCount: number;
  containerReplacementCount: number;
  headingRemovalCount: number;
  headingReplacementCount: number;
  initialContainer: Element | null;
  initialHeading: Element | null;
  lastContainer: Element | null;
  lastHeading: Element | null;
  observer: MutationObserver;
  wasContainerConnected: boolean;
  wasHeadingConnected: boolean;
};

type ExportFirstUseMetrics = {
  active: { clickAt: number | null } | null;
  layoutShifts: Array<{
    hadRecentInput: boolean;
    sources: Array<{
      className: string;
      currentRect: RectDiagnostic;
      previousRect: RectDiagnostic;
      tagName: string;
    }>;
    startTime: number;
    value: number;
  }>;
};

type RectDiagnostic = {
  height: number;
  width: number;
  x: number;
  y: number;
};

async function expectExportForm(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Export data" })
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Reimbursements" })
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Financial year" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export ZIP" })).toBeVisible();
}

async function expectPrivateDocument(response: {
  headers(): Promise<Record<string, string>> | Record<string, string>;
}) {
  const headers = await response.headers();
  expect(headers["cache-control"]).toMatch(/(?:^|,)\s*no-store\b/i);
}

async function expectNoExportForm(response: APIResponse) {
  const body = await response.text();
  expect(body).not.toContain("Export data");
  expect(body).not.toContain('aria-label="Reimbursements"');
  expect(body).not.toContain("Export ZIP");
}

async function configureThrottling(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", {
    cacheDisabled: !WARM_RELOAD,
  });
  await session.send("Network.emulateNetworkConditions", {
    connectionType: "cellular3g",
    downloadThroughput: THROTTLING.downloadBitsPerSecond / 8,
    latency: THROTTLING.latencyMs,
    offline: false,
    uploadThroughput: THROTTLING.uploadBitsPerSecond / 8,
  });
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: THROTTLING.cpuSlowdownMultiplier,
  });
}

async function installHydrationProbe(page: Page) {
  await page.addInitScript(() => {
    const findHeading = () =>
      [...document.querySelectorAll("h1")].find(
        (heading) => heading.textContent?.trim() === "Export data"
      ) ?? null;
    const probe: ExportHydrationProbe = {
      capturedWhileLoading: false,
      containerRemovalCount: 0,
      containerReplacementCount: 0,
      headingRemovalCount: 0,
      headingReplacementCount: 0,
      initialContainer: null,
      initialHeading: null,
      lastContainer: null,
      lastHeading: null,
      observer: undefined as unknown as MutationObserver,
      wasContainerConnected: false,
      wasHeadingConnected: false,
    };

    const inspect = () => {
      const heading = findHeading();
      const container = heading?.closest(".app-container") ?? null;
      if (!(probe.initialHeading && probe.initialContainer)) {
        if (heading && container) {
          probe.initialHeading = heading;
          probe.initialContainer = container;
          probe.lastHeading = heading;
          probe.lastContainer = container;
          probe.wasHeadingConnected = true;
          probe.wasContainerConnected = true;
          probe.capturedWhileLoading = document.readyState === "loading";
        }
        return;
      }

      if (probe.wasHeadingConnected && !probe.initialHeading.isConnected) {
        probe.headingRemovalCount += 1;
      }
      if (probe.wasContainerConnected && !probe.initialContainer.isConnected) {
        probe.containerRemovalCount += 1;
      }
      probe.wasHeadingConnected = probe.initialHeading.isConnected;
      probe.wasContainerConnected = probe.initialContainer.isConnected;

      if (heading && heading !== probe.lastHeading) {
        probe.headingReplacementCount += 1;
        probe.lastHeading = heading;
      }
      if (container && container !== probe.lastContainer) {
        probe.containerReplacementCount += 1;
        probe.lastContainer = container;
      }
    };

    probe.observer = new MutationObserver(inspect);
    probe.observer.observe(document, { childList: true, subtree: true });
    Object.defineProperty(window, "__exportHydrationProbe", {
      configurable: false,
      value: probe,
      writable: false,
    });
    inspect();
  });
}

async function readHydrationProbe(page: Page) {
  return await page.evaluate(() => {
    const probe = (
      window as typeof window & { __exportHydrationProbe: ExportHydrationProbe }
    ).__exportHydrationProbe;
    const currentHeading = [...document.querySelectorAll("h1")].find(
      (heading) => heading.textContent?.trim() === "Export data"
    );
    const currentContainer = currentHeading?.closest(".app-container");
    return {
      captured: Boolean(probe.initialHeading && probe.initialContainer),
      capturedWhileLoading: probe.capturedWhileLoading,
      containerConnected: probe.initialContainer?.isConnected ?? false,
      containerRemovalCount: probe.containerRemovalCount,
      containerReplacementCount: probe.containerReplacementCount,
      headingConnected: probe.initialHeading?.isConnected ?? false,
      headingRemovalCount: probe.headingRemovalCount,
      headingReplacementCount: probe.headingReplacementCount,
      sameContainer: currentContainer === probe.initialContainer,
      sameHeading: currentHeading === probe.initialHeading,
    };
  });
}

async function installFirstUseMetrics(context: BrowserContext) {
  await context.addInitScript(() => {
    const metrics: ExportFirstUseMetrics = { active: null, layoutShifts: [] };
    const rectDiagnostic = (rect: DOMRectReadOnly): RectDiagnostic => ({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    });
    Object.defineProperty(window, "__exportFirstUseMetrics", {
      configurable: false,
      value: metrics,
      writable: false,
    });
    window.addEventListener(
      "click",
      (event) => {
        if (metrics.active?.clickAt === null) {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[role="combobox"][aria-label="Financial year"]')
          ) {
            metrics.active.clickAt = event.timeStamp;
          }
        }
      },
      { capture: true }
    );
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            sources?: Array<{
              currentRect: DOMRectReadOnly;
              node: Node | null;
              previousRect: DOMRectReadOnly;
            }>;
            value: number;
          };
          metrics.layoutShifts.push({
            hadRecentInput: shift.hadRecentInput,
            sources: (shift.sources ?? []).flatMap((source) => {
              if (!(source.node instanceof Element)) {
                return [];
              }
              return [
                {
                  className:
                    typeof source.node.className === "string"
                      ? source.node.className
                      : "",
                  currentRect: rectDiagnostic(source.currentRect),
                  previousRect: rectDiagnostic(source.previousRect),
                  tagName: source.node.tagName.toLowerCase(),
                },
              ];
            }),
            startTime: shift.startTime,
            value: shift.value,
          });
        }
      }).observe({ buffered: true, type: "layout-shift" });
    }
  });
}

async function readLayoutShifts(page: Page) {
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __exportFirstUseMetrics: ExportFirstUseMetrics;
      }
    ).__exportFirstUseMetrics;
    return metrics.layoutShifts;
  });
}

async function measureFinancialYearOpen(page: Page) {
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __exportFirstUseMetrics: ExportFirstUseMetrics;
      }
    ).__exportFirstUseMetrics;
    metrics.active = { clickAt: null };
  });
  await page.getByRole("combobox", { name: "Financial year" }).tap();
  await expect(page.getByRole("option").first()).toBeVisible();
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __exportFirstUseMetrics: ExportFirstUseMetrics;
      }
    ).__exportFirstUseMetrics;
    if (metrics.active?.clickAt === null || !metrics.active) {
      throw new Error("Financial year capture-phase click was not observed");
    }
    const durationMs = performance.now() - metrics.active.clickAt;
    metrics.active = null;
    return durationMs;
  });
}

test.describe("Export authenticated SSR", () => {
  test.beforeEach(({ baseURL: _baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only");
  });

  test("server-renders the protected form without JavaScript", async ({
    baseURL,
    browser,
  }, testInfo) => {
    const storageState = testInfo.project.use.storageState;
    if (!(baseURL && storageState)) {
      throw new Error("Missing E2E base URL or super-admin storage state");
    }

    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      storageState,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto("/export", {
        waitUntil: "domcontentloaded",
      });

      expect(response).not.toBeNull();
      expect(response?.status()).toBe(200);
      await expectPrivateDocument(response!);
      await expect(page).toHaveURL(/\/export$/);
      await expectExportForm(page);
    } finally {
      await context.close();
    }
  });

  test("redirects other identities without leaking protected markup", async ({
    baseURL,
  }) => {
    if (!baseURL) {
      throw new Error("Missing E2E base URL");
    }

    const anonymous = await playwrightRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const volunteer = await playwrightRequest.newContext({
      baseURL,
      storageState: VOLUNTEER_STORAGE_STATE,
    });

    try {
      const anonymousResponse = await anonymous.get("/export", {
        maxRedirects: 0,
      });
      expect(anonymousResponse.status()).toBeGreaterThanOrEqual(300);
      expect(anonymousResponse.status()).toBeLessThan(400);
      expect(
        new URL(anonymousResponse.headers().location ?? "", baseURL).pathname
      ).toBe("/login");
      await expectNoExportForm(anonymousResponse);

      const volunteerResponse = await volunteer.get("/export", {
        maxRedirects: 0,
      });
      expect(volunteerResponse.status()).toBeGreaterThanOrEqual(300);
      expect(volunteerResponse.status()).toBeLessThan(400);
      expect(
        new URL(volunteerResponse.headers().location ?? "", baseURL).pathname
      ).toBe("/");
      await expectNoExportForm(volunteerResponse);
    } finally {
      await anonymous.dispose();
      await volunteer.dispose();
    }
  });

  test("preserves the SSR form through Zero startup and in-app navigation", async ({
    consoleErrors,
    page,
  }) => {
    const consoleMessages: string[] = [];
    let openedSockets = 0;
    page.on("websocket", () => {
      openedSockets += 1;
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleMessages.push(message.text());
      }
    });
    await installHydrationProbe(page);

    await page.goto("/export", { waitUntil: "domcontentloaded" });
    await expectExportForm(page);

    const reimbursements = page.getByRole("checkbox", {
      name: "Reimbursements",
    });
    await expect(reimbursements).toBeChecked();
    await reimbursements.click();
    await expect(reimbursements).not.toBeChecked();

    const financialYear = page.getByRole("combobox", {
      name: "Financial year",
    });
    await financialYear.click();
    const options = page.getByRole("option");
    await expect(options.nth(1)).toBeVisible();
    const selectedYear = (await options.nth(1).textContent())?.trim();
    expect(selectedYear).toBeTruthy();
    await options.nth(1).click();
    await expect(financialYear).toContainText(selectedYear!);

    await waitForZeroReady(page);
    await expect(reimbursements).not.toBeChecked();
    await expect(financialYear).toContainText(selectedYear!);
    expect(await readHydrationProbe(page)).toEqual({
      captured: true,
      capturedWhileLoading: true,
      containerConnected: true,
      containerRemovalCount: 0,
      containerReplacementCount: 0,
      headingConnected: true,
      headingRemovalCount: 0,
      headingReplacementCount: 0,
      sameContainer: true,
      sameHeading: true,
    });

    const socketsBeforeNavigation = openedSockets;
    expect(socketsBeforeNavigation).toBeGreaterThan(0);

    await page
      .getByRole("link", { exact: true, name: "Dashboard" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    await page.getByRole("link", { exact: true, name: "Export" }).click();
    await expect(page).toHaveURL(/\/export$/);
    await expectExportForm(page);
    await waitForZeroReady(page);
    expect(openedSockets, "Navigation must retain the Zero connection").toBe(
      socketsBeforeNavigation
    );

    expect(consoleErrors, "Page errors during SSR hydration").toEqual([]);
    expect(consoleMessages, "Console errors during SSR hydration").toEqual([]);
  });

  test("measures Financial year first-use latency", async ({
    baseURL,
    browser,
  }, testInfo) => {
    test.skip(
      process.env.EXPORT_SSR_PERFORMANCE !== "true",
      "Opt-in Export SSR first-use benchmark"
    );
    test.setTimeout(180_000);
    const storageState = testInfo.project.use.storageState;
    if (!(baseURL && storageState)) {
      throw new Error("Missing E2E base URL or super-admin storage state");
    }

    const samples: Array<{
      firstOpenMs: number;
      layoutShifts: ExportFirstUseMetrics["layoutShifts"];
      pageErrors: Array<{ message: string; name: string }>;
      repeatOpenMs: number;
      run: number;
    }> = [];
    for (let run = 1; run <= EXPORT_SSR_RUNS; run += 1) {
      const context = await browser.newContext({
        baseURL,
        ...MOBILE,
        storageState,
      });
      const pageErrors: Array<{ message: string; name: string }> = [];
      try {
        await installFirstUseMetrics(context);
        const page = await context.newPage();
        page.on("pageerror", (error) => {
          pageErrors.push({ message: error.message, name: error.name });
        });
        await configureThrottling(context, page);
        await page.goto("/export", { waitUntil: "domcontentloaded" });
        await expectExportForm(page);
        await waitForZeroReady(page);

        if (WARM_RELOAD) {
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await page.waitForTimeout(2_000);
          await page.reload({ waitUntil: "domcontentloaded" });
          await expectExportForm(page);
          await waitForZeroReady(page);
        }

        const firstOpenMs = await measureFinancialYearOpen(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("option").first()).toBeHidden();
        const repeatOpenMs = await measureFinancialYearOpen(page);
        const layoutShifts = await readLayoutShifts(page);
        samples.push({
          firstOpenMs,
          layoutShifts,
          pageErrors,
          repeatOpenMs,
          run,
        });
      } finally {
        await context.close();
      }
    }

    const report = {
      methodology: {
        cacheDisabled: !WARM_RELOAD,
        interactionStart: "capture-phase click event timestamp",
        sampleKind: WARM_RELOAD ? "warm reload" : "cold visit",
        network: THROTTLING,
        runs: EXPORT_SSR_RUNS,
        viewport: MOBILE,
      },
      samples,
    };
    const reportPath = testInfo.outputPath("export-first-use.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await testInfo.attach("export-first-use.json", {
      contentType: "application/json",
      path: reportPath,
    });
    expect(
      samples.flatMap((sample) => sample.pageErrors),
      "Export first-use runs must not raise page errors"
    ).toEqual([]);
  });
});
