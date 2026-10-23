import { writeFile } from "node:fs/promises";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const RUNS_PER_VIEWPORT = 3;
const KEY_DELAY_MS = 40;
const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

const VIEWPORTS = [
  {
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    name: "desktop",
    viewport: { height: 900, width: 1440 },
  },
  {
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    name: "mobile",
    viewport: { height: 844, width: 390 },
  },
] as const;

type TransferTotals = {
  count: number;
  transferBytes: number;
};

type BrowserMetrics = {
  jsResources: Array<{ startTimeMs: number; transferBytes: number }>;
  submitStartMs: number | null;
};

type Sample = {
  afterSubmitJavaScript: TransferTotals;
  beforeSubmitJavaScript: TransferTotals;
  run: number;
  submitToReadyMs: number;
  viewport: (typeof VIEWPORTS)[number]["name"];
  webSocketsAfterSubmit: number;
  webSocketsBeforeSubmit: number;
};

async function installMetrics(context: BrowserContext) {
  await context.addInitScript(() => {
    const metrics: BrowserMetrics = {
      jsResources: [],
      submitStartMs: null,
    };
    Object.defineProperty(window, "__loginTransitionMetrics", {
      configurable: false,
      value: metrics,
      writable: false,
    });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        let isJavaScript = false;
        try {
          isJavaScript = new URL(
            resource.name,
            location.href
          ).pathname.endsWith(".js");
        } catch {
          // An unparseable resource cannot be a dashboard asset URL.
        }
        if (isJavaScript) {
          metrics.jsResources.push({
            startTimeMs: resource.startTime,
            transferBytes: resource.transferSize,
          });
        }
      }
    }).observe({ buffered: true, type: "resource" });

    window.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          metrics.submitStartMs === null &&
          target instanceof Element &&
          target.closest('button[type="submit"]')
        ) {
          metrics.submitStartMs = performance.now();
          performance.mark("login-transition-submit");
        }
      },
      { capture: true }
    );
  });
}

async function configureThrottling(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  let webSocketCount = 0;
  session.on("Network.webSocketCreated", () => {
    webSocketCount += 1;
  });
  await session.send("Network.enable");
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
  return () => webSocketCount;
}

function transferTotals(
  resources: BrowserMetrics["jsResources"],
  predicate: (resource: BrowserMetrics["jsResources"][number]) => boolean
) {
  return resources.filter(predicate).reduce<TransferTotals>(
    (totals, resource) => ({
      count: totals.count + 1,
      transferBytes: totals.transferBytes + resource.transferBytes,
    }),
    { count: 0, transferBytes: 0 }
  );
}

async function finishMeasurement(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });

  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __loginTransitionMetrics: BrowserMetrics }
    ).__loginTransitionMetrics;
    if (metrics.submitStartMs === null) {
      throw new Error("Login submit click was not observed");
    }
    return {
      durationMs: performance.now() - metrics.submitStartMs,
      jsResources: structuredClone(metrics.jsResources),
      submitStartMs: metrics.submitStartMs,
    };
  });
}

test("measure login-to-dashboard transition", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.LOGIN_TRANSITION_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(300_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const email = process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test";
  const password = process.env.ADMIN_PASSWORD ?? "TestAdmin123!";
  const samples: Sample[] = [];

  for (const viewport of VIEWPORTS) {
    for (let run = 1; run <= RUNS_PER_VIEWPORT; run += 1) {
      const context = await browser.newContext({
        baseURL,
        deviceScaleFactor: viewport.deviceScaleFactor,
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        storageState: { cookies: [], origins: [] },
        viewport: viewport.viewport,
      });
      try {
        await installMetrics(context);
        const page = await context.newPage();
        let pageErrorCount = 0;
        page.on("pageerror", () => {
          pageErrorCount += 1;
        });
        const getWebSocketCount = await configureThrottling(context, page);

        await page.goto("/login", { waitUntil: "load" });
        await expect(
          page.getByRole("heading", { exact: true, name: "Log in" })
        ).toBeVisible({ timeout: 30_000 });
        const emailInput = page.getByLabel("Email");
        const passwordInput = page.getByLabel("Password");
        const submit = page.getByRole("button", { name: "Log in" });
        await expect(emailInput).toBeEditable();
        await expect(passwordInput).toBeEditable();
        await expect(submit).toBeEnabled();
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        await emailInput.focus();
        await emailInput.pressSequentially(email, { delay: KEY_DELAY_MS });
        await passwordInput.focus();
        await passwordInput.pressSequentially(password, {
          delay: KEY_DELAY_MS,
        });
        expect(
          (await emailInput.inputValue()) === email,
          "Hydrated form retained the typed email"
        ).toBe(true);
        expect(
          (await passwordInput.inputValue()) === password,
          "Hydrated form retained the typed password"
        ).toBe(true);
        await expect(submit).toBeEnabled();

        const webSocketsBeforeSubmit = getWebSocketCount();
        expect(
          webSocketsBeforeSubmit,
          `${viewport.name} run ${run} opened a WebSocket before login`
        ).toBe(0);
        await submit.click();

        await page.waitForURL("/", { timeout: 60_000 });
        await expect(
          page.getByRole("heading", { exact: true, name: "Dashboard" })
        ).toBeVisible({ timeout: 60_000 });
        await waitForZeroReady(page, 60_000, 30_000);
        await expect(
          page.locator('[data-slot="skeleton"]:visible')
        ).toHaveCount(0, { timeout: 30_000 });

        const measurement = await finishMeasurement(page);
        const sample: Sample = {
          afterSubmitJavaScript: transferTotals(
            measurement.jsResources,
            (resource) => resource.startTimeMs >= measurement.submitStartMs
          ),
          beforeSubmitJavaScript: transferTotals(
            measurement.jsResources,
            (resource) => resource.startTimeMs < measurement.submitStartMs
          ),
          run,
          submitToReadyMs: measurement.durationMs,
          viewport: viewport.name,
          webSocketsAfterSubmit: getWebSocketCount() - webSocketsBeforeSubmit,
          webSocketsBeforeSubmit,
        };
        samples.push(sample);
        expect(
          pageErrorCount,
          `${viewport.name} run ${run} had uncaught page errors`
        ).toBe(0);
        console.log(
          `[login-transition] ${viewport.name} run=${run} ` +
            `ready=${sample.submitToReadyMs.toFixed(0)}ms ` +
            `JS before=${sample.beforeSubmitJavaScript.transferBytes}B/${sample.beforeSubmitJavaScript.count} ` +
            `after=${sample.afterSubmitJavaScript.transferBytes}B/${sample.afterSubmitJavaScript.count}`
        );
      } finally {
        await context.close();
      }
    }
  }

  const report = JSON.stringify(
    {
      methodology: {
        cacheEnabled: true,
        credentialTypingDelayMs: KEY_DELAY_MS,
        network: {
          downloadBitsPerSecond: THROTTLING.downloadBitsPerSecond,
          latencyMs: THROTTLING.latencyMs,
          uploadBitsPerSecond: THROTTLING.uploadBitsPerSecond,
        },
        cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
        runsPerViewport: RUNS_PER_VIEWPORT,
        timing:
          "Browser click event on login submit through Dashboard, Zero and font readiness plus final paint; this is an SPA transition duration, not LCP or field INP",
      },
      samples,
    },
    null,
    2
  );
  const reportPath = testInfo.outputPath("login-transition.json");
  await writeFile(reportPath, report);
  await testInfo.attach("login-transition.json", {
    contentType: "application/json",
    path: reportPath,
  });
});
