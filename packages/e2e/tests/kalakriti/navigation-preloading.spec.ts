import type { Page, Request } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const EDITION_ID = "019f0000-0019-7000-8000-000000001901";

async function authenticateInspector(page: Page) {
  const authenticated = await page.evaluate(async (password) => {
    const zero = (
      window as typeof window & {
        __zero: {
          inspector: { authenticate: (password: string) => Promise<boolean> };
        };
      }
    ).__zero;
    return zero.inspector.authenticate(password);
  }, process.env.ZERO_ADMIN_PASSWORD ?? "");
  expect(authenticated, "Zero inspector authentication").toBe(true);
}

test("intent hydrates Students and Entries before navigation", async ({
  page,
}) => {
  await page.goto(`/kalakriti/${YEAR}`);
  await waitForZeroReady(page);
  await authenticateInspector(page);
  const queryStates = () =>
    page.evaluate(async () => {
      const zero = (
        window as typeof window & {
          __zero: {
            inspector: {
              client: {
                queries: () => Promise<
                  {
                    name: string;
                    inactivatedAt: number | null;
                  }[]
                >;
              };
            };
          };
        }
      ).__zero;
      return (await zero.inspector.client.queries()).map((query) => ({
        name: query.name,
        inactive: query.inactivatedAt !== null,
      }));
    });
  await expect(
    page.getByRole("link", { name: "Competitions", exact: true })
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect((await queryStates()).map((query) => query.name)).not.toContain(
    "kalakritiEntry.visible"
  );
  expect((await queryStates()).map((query) => query.name)).not.toContain(
    "kalakritiStudent.visibleForDirectory"
  );

  await page.getByRole("link", { name: "Competitions", exact: true }).hover();
  await expect
    .poll(async () => {
      const states = await queryStates();
      return [
        "kalakritiEntry.visible",
        "kalakritiEntry.availableDivisions",
      ].every((name) =>
        states.some((query) => query.name === name && query.inactive)
      );
    })
    .toBe(true);
  await expect(page).toHaveURL(`/kalakriti/${YEAR}`);

  await page.getByRole("link", { name: "Students", exact: true }).focus();
  await expect
    .poll(async () =>
      (await queryStates()).some(
        (query) =>
          query.name === "kalakritiStudent.visibleForDirectory" &&
          query.inactive
      )
    )
    .toBe(true);
  await expect(page).toHaveURL(`/kalakriti/${YEAR}`);
  await page
    .getByRole("link", { name: "Students", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Students", exact: true })
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await queryStates()).some(
        (query) =>
          query.name === "kalakritiStudent.visibleForDirectory" &&
          !query.inactive
      )
    )
    .toBe(true);
});

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

function isEditionPickerRequest(request: Request) {
  if (request.method() !== "GET") return false;
  const url = new URL(request.url());
  return (
    url.pathname.startsWith("/_serverFn/") &&
    url.searchParams.get("payload")?.includes(EDITION_ID) === true
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
    .getByRole("link", { name: "Competitions", exact: true })
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
  await expect(page).toHaveURL(`/kalakriti/${YEAR}/competitions`);
  await expect(
    page.getByRole("heading", { name: "Competitions", exact: true })
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
  await authenticateInspector(page);

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const zero = (
          window as typeof window & {
            __zero: {
              inspector: {
                client: {
                  queries: () => Promise<
                    {
                      name: string;
                      deleted: boolean;
                      inactivatedAt: number | null;
                    }[]
                  >;
                };
              };
            };
          }
        ).__zero;
        return (await zero.inspector.client.queries()).some(
          (query) =>
            query.name === "reimbursement.all" &&
            !query.deleted &&
            query.inactivatedAt === null
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

test("volunteer pickers load only when their dialogs open", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Volunteer roster needs an admin"
  );
  const pickerRequests: Request[] = [];
  page.on("request", (request) => {
    if (isEditionPickerRequest(request)) pickerRequests.push(request);
  });

  await page.goto(`/kalakriti/${YEAR}/volunteers`);
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "Volunteers", exact: true })
  ).toBeVisible();
  await page.waitForTimeout(750);
  expect(pickerRequests).toHaveLength(0);

  await page.getByRole("button", { name: "Add volunteers" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add volunteers" });
  await expect(
    addDialog.getByPlaceholder("Search central volunteers...")
  ).toBeVisible();
  expect(pickerRequests).toHaveLength(1);
  const addPickerPath = new URL(pickerRequests[0].url()).pathname;

  await addDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(addDialog).toBeHidden();
  await page.getByRole("button", { name: "Add volunteers" }).click();
  await expect(
    addDialog.getByPlaceholder("Search central volunteers...")
  ).toBeVisible();
  expect(pickerRequests).toHaveLength(1);
  await addDialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByTestId("row-actions").first().click();
  await page.getByRole("menuitem", { name: "Assign role" }).click();
  const roleDialog = page.getByRole("dialog", { name: "Assign role" });
  await expect(
    roleDialog.getByPlaceholder("Search volunteers...")
  ).toBeVisible();
  expect(pickerRequests).toHaveLength(2);
  expect(new URL(pickerRequests[1].url()).pathname).not.toBe(addPickerPath);
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
      .getByRole("link", { name: "Competitions", exact: true })
      .first()
      .click();
    await expect(
      guardianPage.getByRole("heading", { name: "Competitions", exact: true })
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
