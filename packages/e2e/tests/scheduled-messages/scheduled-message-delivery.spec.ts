import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/scheduled-delivery.ts"
);

async function fixture<T>(...args: string[]) {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

interface Group {
  id: string;
  jid: string;
  name: string;
}

// A failing send retries three times with backoff before the dead-letter
// handler marks it failed, which takes about a minute.
const DELIVERY_TIMEOUT = 100_000;

async function openMessages(page: Page, tag: string) {
  await page.goto(`/scheduled-messages?search=${encodeURIComponent(tag)}`);
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: "Messages" })
  ).toBeVisible();
  await waitForZeroReady(page);
}

function messageRow(page: Page, text: string) {
  return page.getByRole("row").filter({ hasText: text });
}

async function openDetails(page: Page, text: string) {
  await new ListPage(page).openRowActionAndClick(
    messageRow(page, text),
    "View details"
  );
  const sheet = page.getByRole("dialog", { name: "Scheduled message" });
  await expect(sheet.getByText(text)).toBeVisible();
  return sheet;
}

function recipientRow(sheet: ReturnType<Page["getByRole"]>, name: string) {
  return sheet.getByRole("row").filter({ hasText: name });
}

/** Enqueues a job through the admin jobs API, as the Jobs page would. */
async function enqueueJob(page: Page, queue: string, data: object) {
  const response = await page.request.post("/api/jobs", {
    data: { data, queue },
  });
  expect(response.status()).toBe(201);
}

test.describe("Scheduled message delivery (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("reports sent, failed and partial delivery per recipient", async ({
    page,
  }) => {
    test.slow();
    const tag = `e2e-delivery-${Date.now()}`;
    const { failGroup, okGroup } = await fixture<{
      failGroup: Group;
      okGroup: Group;
    }>("groups", tag);
    const messages = {
      failed: { groups: [failGroup], text: `${tag} to the failing group` },
      partial: { groups: [okGroup, failGroup], text: `${tag} to both groups` },
      sent: { groups: [okGroup], text: `${tag} to the working group` },
    };

    for (const { groups, text } of Object.values(messages)) {
      // A fresh page each time: the dialog keeps the last message's
      // recipients after it closes.
      await openMessages(page, tag);
      await page.getByRole("button", { name: "Schedule message" }).click();
      const dialog = page.getByRole("dialog", { name: "Schedule message" });
      await dialog.getByRole("textbox", { name: "Message" }).fill(text);
      await dialog.getByRole("switch", { name: "Send now" }).click();
      await dialog.getByRole("button", { name: "Add recipients..." }).click();
      // People load after the groups and shift the list; let them settle.
      await expect(page.getByText("Loading people...")).toBeHidden();
      for (const [index, group] of groups.entries()) {
        await page.getByPlaceholder("Search groups and users...").fill(tag);
        await page.getByRole("option", { name: group.name }).click();
        // The open picker hides the dialog from the accessibility tree.
        await expect(
          page.getByText(new RegExp(`^${index + 1}/\\d+ recipients selected`))
        ).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await dialog
        .getByRole("button", { exact: true, name: "Send message" })
        .click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
      await expect(messageRow(page, text)).toBeVisible();
    }

    await expect(messageRow(page, messages.sent.text)).toContainText("Sent", {
      timeout: DELIVERY_TIMEOUT,
    });
    await expect(messageRow(page, messages.failed.text)).toContainText(
      "Failed",
      { timeout: DELIVERY_TIMEOUT }
    );
    await expect(messageRow(page, messages.partial.text)).toContainText(
      "Partial",
      { timeout: DELIVERY_TIMEOUT }
    );

    const sheet = await openDetails(page, messages.partial.text);
    await expect(recipientRow(sheet, okGroup.name)).toContainText("Sent");
    await expect(recipientRow(sheet, failGroup.name)).toContainText("Failed");
    await expect(recipientRow(sheet, failGroup.name)).toContainText(
      "All retries exhausted"
    );
  });

  test("keeps attachments after delivery and after a send gives up", async ({
    page,
    superAdminEmail,
  }) => {
    test.slow();
    const tag = `e2e-retention-${Date.now()}`;
    const seeded = await fixture<{
      jobs: object[];
      r2Key: string;
      text: string;
    }>("with-attachment", superAdminEmail, tag);
    for (const job of seeded.jobs) {
      await enqueueJob(page, "send-scheduled-whatsapp", job);
    }

    await openMessages(page, tag);
    await expect(messageRow(page, seeded.text)).toContainText("Partial", {
      timeout: DELIVERY_TIMEOUT,
    });

    const sheet = await openDetails(page, seeded.text);
    await expect(sheet.getByText("Attachments (1)")).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: "Download poster.jpg" })
    ).toBeVisible();
    expect(
      (await fixture<{ total: number }>("delete-jobs", seeded.r2Key)).total
    ).toBe(0);
  });

  test("fails recipients still pending a week after their time", async ({
    page,
    superAdminEmail,
  }) => {
    test.slow();
    const tag = `e2e-stale-${Date.now()}`;
    const seeded = await fixture<{
      oldText: string;
      r2Key: string;
      recentText: string;
    }>("stale", superAdminEmail, tag);

    await openMessages(page, tag);
    await expect(messageRow(page, seeded.oldText)).toContainText("Pending");
    await expect(messageRow(page, seeded.recentText)).toContainText("Pending");

    await enqueueJob(page, "cleanup-stale-scheduled-recipients", {});

    await expect(messageRow(page, seeded.oldText)).toContainText("Partial", {
      timeout: 30_000,
    });
    // Six days is inside the cutoff, so that send may still go out.
    await expect(messageRow(page, seeded.recentText)).toContainText("Pending");

    const sheet = await openDetails(page, seeded.oldText);
    await expect(recipientRow(sheet, `${tag} ok group`)).toContainText("Sent");
    await expect(recipientRow(sheet, `${tag} fail group`)).toContainText(
      "Stale: never delivered"
    );
    await expect(sheet.getByText("Attachments (1)")).toBeVisible();
    expect(
      (await fixture<{ total: number }>("delete-jobs", seeded.r2Key)).total
    ).toBe(0);
  });
});
