import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

async function volunteerRow(page: import("@playwright/test").Page) {
  await page.goto("/users");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search users...").fill("test-volunteer");
  const row = new ListPage(page)
    .getTable()
    .getByRole("row")
    .filter({ hasText: "test-volunteer@pi-dash.test" });
  await expect(row).toBeVisible();
  return row;
}

test("desktop row actions retain menu keyboard behavior", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  const row = await volunteerRow(page);
  const trigger = row.getByTestId("row-actions");

  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /actions$/i })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile row actions dismiss and open the edit dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await volunteerRow(page);
  const trigger = row.getByTestId("row-actions");

  await trigger.click();
  const sheet = page.getByRole("dialog", { name: /actions$/i });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await trigger.click();
  await sheet.getByRole("button", { name: "Edit" }).click();
  await expect(sheet).toBeHidden();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("Name")).toHaveValue(/\S/);
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toBeHidden();
});

test("mobile destructive action keeps its confirmation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await volunteerRow(page);

  await row.getByTestId("row-actions").click();
  const sheet = page.getByRole("dialog", { name: /actions$/i });
  await sheet.getByRole("button", { name: "Delete" }).click();
  await expect(sheet).toBeHidden();

  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", { name: "Delete user" })
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await expect(row).toBeVisible();
});

test("mobile self actions preserve disabled destructive controls", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/users");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search users...").fill(superAdminEmail);
  const row = new ListPage(page)
    .getTable()
    .getByRole("row")
    .filter({ hasText: superAdminEmail });
  await expect(row).toBeVisible();

  await row.getByTestId("row-actions").click();
  const sheet = page.getByRole("dialog", { name: /actions$/i });
  await expect(sheet.getByRole("button", { name: "Ban user" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("mobile account actions open notifications separately", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin account menu");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/users");
  await waitForZeroReady(page);

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  const actions = page.getByRole("dialog", { name: "Account actions" });
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Notifications" }).click();
  await expect(actions).toBeHidden();

  const notifications = page.getByRole("dialog", { name: "Notifications" });
  await expect(notifications).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notifications).toBeHidden();
});

test("resizing an open mobile sheet switches back to a desktop menu", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await volunteerRow(page);
  const trigger = row.getByTestId("row-actions");

  await trigger.click();
  await expect(page.getByRole("dialog", { name: /actions$/i })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("dialog", { name: /actions$/i })).toHaveCount(0);

  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
});

test("small mobile sheets scroll to actions and dismiss on backdrop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 320 });
  const row = await volunteerRow(page);
  const trigger = row.getByTestId("row-actions");
  const sheet = page.getByRole("dialog", { name: /actions$/i });

  await trigger.click();
  await expect(sheet).toBeVisible();
  await page.locator('[data-slot="drawer-viewport"]').click({
    position: { x: 10, y: 10 },
  });
  await expect(sheet).toBeHidden();

  await trigger.click();
  const deleteAction = sheet.getByRole("button", { name: "Delete" });
  await deleteAction.scrollIntoViewIfNeeded();
  await expect(deleteAction).toBeInViewport();
  await deleteAction.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
});

test("swiping down on the mobile action sheet dismisses it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only user menu");
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await volunteerRow(page);
  await row.getByTestId("row-actions").click();
  const sheet = page.getByRole("dialog", { name: /actions$/i });
  await expect(sheet).toBeVisible();

  const heading = sheet.getByText(/actions$/i);
  await heading.hover();
  const bounds = await heading.boundingBox();
  const sheetBounds = await sheet.boundingBox();
  expect(bounds).not.toBeNull();
  expect(sheetBounds).not.toBeNull();
  if (!bounds || !sheetBounds) return;

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const x = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  const distance = sheetBounds.height * 0.65;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y: startY }],
  });
  for (let step = 1; step <= 6; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: startY + (step / 6) * distance }],
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(sheet).toBeHidden();
});

test("mobile link actions retain navigation semantics", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "super_admin", "Admin-only request menu");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reimbursements");
  await waitForZeroReady(page);
  const list = new ListPage(page);
  await list.waitForTableData();

  await list.getRows().nth(1).getByTestId("row-actions").click();
  const sheet = page.getByRole("dialog", { name: /actions$/i });
  const view = sheet.getByRole("link", { name: "View" });
  await expect(view).toHaveAttribute("href", /\/reimbursements\/[^/]+/);
  await view.focus();
  await page.keyboard.press("Space");
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/reimbursements$/);

  const [linkedPage] = await Promise.all([
    page.context().waitForEvent("page"),
    view.click({ modifiers: ["ControlOrMeta"] }),
  ]);
  await expect(linkedPage).toHaveURL(/\/reimbursements\/[^/?]+/);
  await linkedPage.close();
  await expect(page).toHaveURL(/\/reimbursements$/);
  await list.getRows().nth(1).getByTestId("row-actions").click();
  await view.click();
  await expect(page).toHaveURL(/\/reimbursements\/[^/?]+/);
});
