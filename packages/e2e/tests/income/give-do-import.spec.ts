import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickPageAction } from "../../helpers/page-header";
import { ListPage } from "../../pages/list-page";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../fixtures/income/give-do-sample.csv"
);

const hashBytes = (seed: string) => createHash("sha256").update(seed).digest();

/** A PAN for this run and seed, so an earlier run's donor never matches. */
function runPan(seed: string): string {
  const bytes = hashBytes(seed);
  const letter = (i: number) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(bytes[i] ?? 0) % 26] ?? "A";
  const digit = (i: number) => String((bytes[i] ?? 0) % 10);
  return (
    [0, 1, 2, 3, 4].map(letter).join("") +
    [5, 6, 7, 8].map(digit).join("") +
    letter(9)
  );
}

/** An Indian mobile number for this run and seed, as give.do writes it. */
function runPhone(seed: string): string {
  const bytes = hashBytes(seed);
  return `+9198${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => String((bytes[i] ?? 0) % 10)).join("")}`;
}

interface Run {
  id: string;
  pans: Record<"A" | "B" | "C", string>;
}

function newRun(): Run {
  const id = `${Date.now()}${randomUUID().slice(0, 6)}`;
  return {
    id,
    pans: { A: runPan(`${id}A`), B: runPan(`${id}B`), C: runPan(`${id}C`) },
  };
}

function fill(run: Run, text: string): string {
  return text
    .replaceAll("{RUN}", run.id)
    .replaceAll("{PAN_A}", run.pans.A)
    .replaceAll("{PAN_C}", run.pans.C)
    .replace(/\{PHONE_([A-E])\}/g, (_, letter: string) =>
      runPhone(`${run.id}${letter}`)
    );
}

function fixtureCsv(run: Run): Buffer {
  return Buffer.from(fill(run, readFileSync(FIXTURE, "utf8")), "utf8");
}

/**
 * A later export with one new gift from the donor who gave no PAN the first
 * time, now with a PAN: matched by email, so the PAN can be filled in.
 */
function laterExportCsv(run: Run): Buffer {
  const [header] = readFileSync(FIXTURE, "utf8").split("\n");
  const row = `02/07/2024,10:00,LC{RUN}B2,INR,600,GiveDo NoPan {RUN},nopan-{RUN}@example.com,{PHONE_B},4 Sample Road,,Pune,Maharashtra,India,411001,"4 Sample Road, Pune, Maharashtra, India, 411001",${run.pans.B},ONE-TIME,,`;
  return Buffer.from(fill(run, `${header}\n${row}\n`), "utf8");
}

const tab = (page: Page, label: RegExp): Locator =>
  page.getByRole("tab", { name: label });

async function uploadGiveDo(page: Page, name: string, csv: Buffer) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await clickPageAction(page, "Import contributions");
  await expect(
    page.getByRole("heading", { name: "Import contributions" })
  ).toBeVisible();

  // Uploads start as give.do, on the give.do clearing account with the channel fixed.
  await expect(page.getByLabel("Source")).toContainText("give.do");
  await expect(
    page.getByRole("combobox", { name: "Deposited into" })
  ).toHaveValue(/give\.do clearing/);
  await expect(page.getByLabel("Channel")).toHaveCount(0);

  await page
    .getByTestId("import-file-input")
    .setInputFiles({ buffer: csv, mimeType: "text/csv", name });
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("Income: give.do import", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("imports a give.do export through GiveIndia, then recognises it again", async ({
    page,
  }) => {
    test.slow();
    const run = newRun();

    await uploadGiveDo(page, `give-do-${run.id}.csv`, fixtureCsv(run));
    // Step 2: every give.do column is matched by the preset.
    await expect(
      page.getByText("All 19 give.do columns found and matched")
    ).toBeVisible();
    await expect(page.locator('[data-column="Donor PAN"]')).toContainText(
      "PAN / ID number"
    );
    await expect(
      page.locator('[data-column="Donation Currency"]')
    ).toContainText("Currency");
    await expect(page.locator('[data-column="Time"]')).toContainText(
      "Don't import"
    );
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: the repeat donor's two gifts make one new donor; USD is refused.
    await expect(page.getByRole("tab", { name: /^All 6$/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(tab(page, /^New donors 5$/)).toBeVisible();
    await expect(tab(page, /^Errors 1$/)).toBeVisible();
    await tab(page, /^Errors 1$/).click();
    await expect(page.locator('[data-row-number="5"]')).toContainText(
      "Foreign currency: FCRA is not activated"
    );

    await page.getByRole("button", { name: "Import 5 contributions" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(
      "5 contributions will be imported, 4 new donors created, 1 row skipped."
    );
    await confirm.getByRole("button", { name: "Import" }).click();
    const result = page.getByTestId("import-result");
    await expect(result).toContainText("5 contributions imported");
    await expect(result).toContainText("4 new donors created");

    await page
      .getByRole("link", { name: "View imported contributions" })
      .click();
    await waitForZeroReady(page);
    const repeat = page
      .getByRole("row")
      .filter({ hasText: `GiveDo Repeat ${run.id}` });
    await expect(repeat).toHaveCount(2, { timeout: 15_000 });
    const single = page
      .getByRole("row")
      .filter({ hasText: `GiveDo Single ${run.id}` });
    await new ListPage(page).openRowActionAndClick(single, "View");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Through");
    await expect(sheet).toContainText("GiveIndia (give.do)");
    await expect(sheet).toContainText("give.do");
    await page.keyboard.press("Escape");

    // The same export again: every gift is already imported.
    await uploadGiveDo(page, `give-do-${run.id}-again.csv`, fixtureCsv(run));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(tab(page, /^Already imported 5$/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(tab(page, /^Errors 1$/)).toBeVisible();
    await expect(tab(page, /^New donors/)).toHaveCount(0);
  });

  test("fills a returning donor's missing PAN when their email match is accepted", async ({
    page,
  }) => {
    test.slow();
    const run = newRun();
    const donor = `GiveDo NoPan ${run.id}`;

    await uploadGiveDo(page, `give-do-${run.id}.csv`, fixtureCsv(run));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(tab(page, /^New donors 5$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Import 5 contributions" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page.getByTestId("import-result")).toBeVisible();

    await uploadGiveDo(
      page,
      `give-do-${run.id}-later.csv`,
      laterExportCsv(run)
    );
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(tab(page, /^Needs review 1$/)).toBeVisible({
      timeout: 20_000,
    });
    const row = page.locator('[data-row-number="1"]');
    await row.getByRole("combobox", { name: "Donor for row 1" }).click();
    await page
      .getByRole("option")
      .filter({ hasText: `${donor} (same email)` })
      .click();
    const fillMissing = row.getByRole("checkbox", {
      name: /Fill missing details/,
    });
    await expect(fillMissing).toBeChecked();
    await expect(row).toContainText("Adds the PAN / ID number from this row");

    await page.getByRole("button", { name: "Import 1 contribution" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(
      "1 existing donor gets missing details filled."
    );
    await confirm.getByRole("button", { name: "Import" }).click();
    const result = page.getByTestId("import-result");
    await expect(result).toContainText("1 contribution imported");
    await expect(result).toContainText(
      "1 existing donor's missing details filled"
    );

    await page.goto("/donors");
    await waitForZeroReady(page);
    await page.getByPlaceholder("Search donors...").fill(donor);
    const donorRow = page.getByRole("row").filter({ hasText: donor });
    await expect(donorRow).toHaveCount(1, { timeout: 15_000 });
    await new ListPage(page).openRowActionAndClick(donorRow, "View");
    await expect(page.getByText(`•••• ${run.pans.B.slice(-4)}`)).toBeVisible({
      timeout: 10_000,
    });
    // The address it already had is kept.
    await expect(page.getByText("4 Sample Road")).toBeVisible();
  });
});
