import type { Request } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;

function isEditionAccessRequest(request: Request) {
  if (request.method() !== "GET") return false;
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/_serverFn/")) return false;
  const payload = url.searchParams.get("payload");
  return (
    payload !== null &&
    new RegExp(`\\b${YEAR}\\b`).test(payload) &&
    payload.includes("year")
  );
}

test("visible Kalakriti links do not trigger an access-request burst", async ({
  page,
}) => {
  const accessRequests: Request[] = [];
  page.on("request", (request) => {
    if (isEditionAccessRequest(request)) accessRequests.push(request);
  });

  await page.goto(`/kalakriti/${YEAR}/students`);
  await waitForZeroReady(page);
  const entries = page
    .getByRole("link", { name: "Entries", exact: true })
    .first();
  await expect(entries).toBeVisible();

  // Initial hydration may perform an access check. Visible links must not
  // trigger the previous many-request burst or keep issuing new checks.
  await page.waitForTimeout(750);
  expect(accessRequests.length).toBeLessThanOrEqual(3);
  const afterInitialLoad = accessRequests.length;

  await entries.hover();
  await expect
    .poll(() => accessRequests.length)
    .toBeGreaterThan(afterInitialLoad);
  const afterHover = accessRequests.length;
  expect(afterHover - afterInitialLoad).toBe(1);
  await entries.click();
  await expect(page).toHaveURL(`/kalakriti/${YEAR}/entries`);
  await expect(
    page.getByRole("heading", { name: "Entries", exact: true })
  ).toBeVisible();
  await waitForZeroReady(page);
  // A completed hover request may be checked again on click. Only concurrent
  // work is deduplicated; there is no settled authorization cache.
  expect(accessRequests.length - afterHover).toBeLessThanOrEqual(2);

  const students = page
    .getByRole("link", { name: "Students", exact: true })
    .first();
  const beforeFocus = accessRequests.length;
  await students.focus();
  await expect.poll(() => accessRequests.length).toBeGreaterThan(beforeFocus);
  const afterFocus = accessRequests.length;
  expect(afterFocus - beforeFocus).toBe(1);
  await students.press("Enter");
  await expect(page).toHaveURL(`/kalakriti/${YEAR}/students`);
  await expect(
    page.getByRole("heading", { name: "Students", exact: true })
  ).toBeVisible();
  await waitForZeroReady(page);
  expect(accessRequests.length - afterFocus).toBeLessThanOrEqual(2);
});

test("Dashboard-only preloads release their active Zero subscriptions", async ({
  page,
}) => {
  await page.goto("/");
  await waitForZeroReady(page);

  const inspector = await page.evaluate(() => {
    const zero = (
      window as typeof window & {
        __zero?: {
          inspector?: { client?: { queries: () => Promise<unknown[]> } };
        };
      }
    ).__zero;
    return Boolean(zero?.inspector?.client);
  });
  test.skip(!inspector, "Zero inspector is unavailable in this E2E runtime");

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const zero = (
          window as typeof window & {
            __zero: {
              inspector: {
                client: {
                  queries: () => Promise<{ name: string }[]>;
                };
              };
            };
          }
        ).__zero;
        return (await zero.inspector.client.queries()).some(
          (query) => query.name === "reimbursement.all"
        );
      })
    )
    .toBe(true);

  await page
    .getByRole("link", { name: "Kalakriti", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/kalakriti(?:\/\d{4})?\/?$/);
  await waitForZeroReady(page);

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const zero = (
            window as typeof window & {
              __zero: {
                inspector: {
                  client: {
                    queries: () => Promise<
                      {
                        deleted: boolean;
                        inactivatedAt: number | null;
                        name: string;
                      }[]
                    >;
                  };
                };
              };
            }
          ).__zero;
          const queries = await zero.inspector.client.queries();
          return queries
            .filter((query) => query.name === "reimbursement.all")
            .every((query) => query.deleted || query.inactivatedAt !== null);
        }),
      { timeout: 15_000 }
    )
    .toBe(true);
});

test("restricted access still allows assigned pages and denies another user", async ({
  baseURL,
  browser,
  kalakritiActors,
}) => {
  const guardianContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.guardian.storageState,
  });
  try {
    const guardianPage = await guardianContext.newPage();
    await guardianPage.goto(`/kalakriti/${YEAR}/students`);
    await waitForZeroReady(guardianPage);
    await expect(
      guardianPage.getByRole("heading", { name: "Students", exact: true })
    ).toBeVisible();
    await guardianPage
      .getByRole("link", { name: "Entries", exact: true })
      .first()
      .click();
    await expect(
      guardianPage.getByRole("heading", { name: "Entries", exact: true })
    ).toBeVisible();
  } finally {
    await guardianContext.close();
  }

  const unrelatedContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.unrelatedVolunteer.storageState,
  });
  try {
    const unrelatedPage = await unrelatedContext.newPage();
    await unrelatedPage.goto(`/kalakriti/${YEAR}/students`);
    await expect(
      unrelatedPage.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
  } finally {
    await unrelatedContext.close();
  }
});
