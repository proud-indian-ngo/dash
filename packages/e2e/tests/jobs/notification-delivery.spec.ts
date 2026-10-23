import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/notification-delivery.ts"
);

async function fixture(...args: string[]) {
  await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
}

/** The page searched to the seeded rows, with an optional WhatsApp status. */
function deliveryUrl(
  tag: string,
  options: { size?: number; whatsapp?: string }
) {
  const params = new URLSearchParams({ search: tag });
  if (options.size) {
    params.set("size", String(options.size));
  }
  if (options.whatsapp) {
    params.set(
      "filters",
      JSON.stringify({
        combinator: "and",
        id: "root",
        rules: [
          {
            id: "whatsapp",
            operator: "is",
            path: ["whatsapp"],
            type: "rule",
            value: options.whatsapp,
          },
        ],
        type: "group",
      })
    );
  }
  return `/notification-delivery?${params.toString()}`;
}

test.describe("Notification delivery (admin)", () => {
  const tag = `e2e-delivery-${Date.now()}`;
  const title = `Delivery check ${tag}`;

  // The tests read the same seeded rows, so they share a worker.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ volunteerEmail }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await fixture("seed", volunteerEmail, tag);
  });

  test.afterAll(async ({ browserName: _browserName }, testInfo) => {
    if (testInfo.project.name === "super_admin") {
      await fixture("clear", tag);
    }
  });

  test("lists a seeded notification per channel and opens its trail", async ({
    page,
    volunteerEmail,
  }) => {
    // Searched to the tag: concurrent specs notify too, so the seeded row
    // can fall off the first page of the unfiltered list.
    await page.goto(deliveryUrl(tag, {}));
    await expect(
      page.getByRole("heading", { name: "Notification delivery" })
    ).toBeVisible();
    await expect(page.locator("[data-slot='stat-chip']").first()).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Unread")).toBeVisible();
    await expect(row.getByText("Delivered")).toBeVisible();
    await expect(row.getByText("Held")).toBeVisible();
    await expect(row).not.toContainText(volunteerEmail);

    await row.getByText(title).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: title })).toBeVisible();
    await expect(sheet.getByText("team_added")).toBeVisible();
    await expect(sheet).not.toContainText(volunteerEmail);
    await expect(
      sheet.getByText(
        "Inbox body for main from the Notification delivery spec."
      )
    ).toBeVisible();
    const whatsapp = sheet.getByTestId("whatsapp-preview");
    await expect(whatsapp).toContainText(
      "You've been added to the team Delivery Spec Team on Proud Indian Dashboard."
    );
    await expect(whatsapp).toContainText("Open dashboard");

    // The open row is in the URL, so the link opens it again.
    await expect(page).toHaveURL(/message=/);
    await page.reload();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: title })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("filters by WhatsApp status and counts in the database", async ({
    page,
  }) => {
    await page.goto(deliveryUrl(tag, { whatsapp: "failed" }));
    const rows = page.getByRole("row").filter({ hasText: tag });
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first()).toContainText(`Delivery failed ${tag}`);
    await expect(
      rows.first().getByText("Failed", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("1 - 1 of 1")).toBeVisible();
  });

  test("shows the email delivery log's status and reason", async ({ page }) => {
    const row = page
      .getByRole("row")
      .filter({ hasText: `Delivery failed ${tag}` });
    await page.goto(deliveryUrl(tag, {}));
    await expect(row.getByText("Bounced")).toBeVisible({ timeout: 15_000 });

    await row.getByText(`Delivery failed ${tag}`).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByText("Permanent (General): Mailbox does not exist")
    ).toBeVisible();
  });

  test("pages the search results and shows a summary send", async ({
    page,
  }) => {
    await page.goto(deliveryUrl(tag, { size: 2 }));
    const rows = page.getByRole("row").filter({ hasText: tag });
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText("1 - 2 of 3")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Pagination" })
      .getByRole("button", { name: "Page 2", exact: true })
      .click();
    await expect(page.getByText("3 - 3 of 3")).toBeVisible();
    const summary = page
      .getByRole("row")
      .filter({ hasText: `Delivery summary ${tag}` });
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary.getByText("Sent in summary")).toBeVisible();
  });

  test("shows a group post's receipts and who read it", async ({ page }) => {
    const group = `Spec group ${tag.replace("delivery", "group")}`;
    await page.goto(
      `/notification-delivery?${new URLSearchParams({ search: group })}`
    );
    const row = page.getByRole("row").filter({ hasText: group });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("Weekly events digest");
    await expect(row.getByText("Delivered to 2 · Read by 1")).toBeVisible();
    await expect(row.getByText("Group post", { exact: true })).toBeVisible();
    await expect(
      row.getByText("WhatsApp group", { exact: true })
    ).toBeVisible();

    await row.getByText("Weekly events digest").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("gateway-preview")).toContainText(
      `${tag} this week's events`
    );
    const readers = sheet.getByRole("region", { name: "Read by" });
    await expect(readers).toContainText("Read by (1)");
    await expect(readers).toContainText("Spec Reader");
    const unread = sheet.getByRole("region", { name: "Delivered, not read" });
    await expect(unread).toContainText("+91 •••• ••901");
    await expect(sheet).not.toContainText("919800000901");
    await expect(sheet).not.toContainText("98000 00901");
  });

  test("shows the WhatsApp status at phone width", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 390 });
    await page.goto(deliveryUrl(tag, {}));
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Delivered")).toBeVisible();
  });
});

test.describe("Notification delivery permission", () => {
  test("admin can open the page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/notification-delivery");
    await expect(
      page.getByRole("heading", { name: "Notification delivery" })
    ).toBeVisible();
  });

  test("volunteer is redirected to the dashboard", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/notification-delivery");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });
});
