import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * Circulars against the seeded board: the super admin is the Managing
 * Trustee (Asha Rao) and the admin the Joint Managing Trustee (Vikram
 * Menon), the two trustees in office. Each test drafts its own
 * resolutions. Signing needs the signing service, which E2E doesn't run;
 * the pass rules with signatures are covered by unit and database tests.
 */

/**
 * Inserts `item` from the editor's Insert menu. Toolbar menus are toggle
 * items, so they're found by their label rather than as buttons.
 */
async function insert(page: Page, dialog: Locator, item: string) {
  await dialog.getByLabel("Insert", { exact: true }).click();
  await page.getByRole("menuitem", { exact: true, name: item }).click();
  // The editor takes focus back a moment after the change; keys typed
  // before then reach the Insert button, and Enter reopens its menu.
  await expect(dialog.getByRole("textbox", { name: "Text" })).toBeFocused();
}

/** Replaces the rich text in the dialog's Text editor with `text`. */
async function writeText(page: Page, dialog: Locator, text: string) {
  const editor = dialog.getByRole("textbox", { name: "Text" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

async function draft(page: Page, title: string) {
  await page.goto("/governance/resolutions");
  await page.getByRole("button", { name: "New circular" }).click();
  const dialog = page.getByRole("dialog", { name: "New circular" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await writeText(
    page,
    dialog,
    "RESOLVED THAT the Board approves the end-to-end test."
  );
  await dialog.getByRole("button", { name: "Create draft" }).click();
  // The first save in a fresh stack waits for Zero's initial sync.
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 20_000,
  });
}

/** Issues the open draft, with any other drafts named, in that order. */
async function issue(page: Page, alsoTitles: string[] = []) {
  await page.getByRole("button", { exact: true, name: "Issue" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue a circular" });
  for (const title of alsoTitles) {
    await dialog.getByRole("checkbox", { name: title }).check();
  }
  await dialog
    .getByRole("button", { name: /^Issue (\d+ resolutions )?to the trustees$/ })
    .click();
  await expect(page.getByRole("heading", { name: /^Circular C-/ })).toBeVisible(
    { timeout: 20_000 }
  );
}

/** Voting asks for the password when the sign-in is older than 10 minutes. */
async function confirmIfAsked(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Confirm it's you" });
  await reauth
    .waitFor({ state: "visible", timeout: 5000 })
    .then(async () => {
      await reauth
        .getByLabel("Password")
        .fill(process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!");
      await reauth.getByRole("button", { name: "Continue" }).click();
    })
    .catch(() => undefined);
}

function resolutionCard(page: Page, title: string) {
  return page.getByRole("region", { name: title });
}

test.describe("circular resolutions (Managing Trustee)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    test.skip(
      Boolean(process.env.CI) &&
        testInfo.title !== "records a past resolution so the series continues",
      "Issuing stores the circular's PDF in R2, which CI does not have"
    );
  });

  test("an objection from one of two trustees fails the resolution", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular objected ${Date.now()}`;
    await draft(page, title);
    await issue(page);
    const card = resolutionCard(page, title);
    await expect(card).toContainText("0 of 2 signatures");
    const panel = page.getByRole("region", { name: "Your signature" });
    await expect(panel).toContainText("Signing assents to resolution 1");
    // Folded behind the DSC button when the signing helper is available.
    const otherWays = panel.getByRole("button", {
      name: "Sign in Acrobat instead",
    });
    if (await otherWays.isVisible()) {
      await otherWays.click();
    }
    await expect(
      panel.getByRole("button", { name: "Download your copy" })
    ).toBeVisible();

    await card.getByRole("button", { name: "Object to resolution 1" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Object to this resolution",
    });
    await dialog.getByLabel("Reason").fill("The budget isn't approved yet.");
    await dialog.getByRole("button", { name: "Record objection" }).click();
    await confirmIfAsked(page);
    await expect(card.getByText("Failed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card).toContainText("1 objection left too few trustees");
    await expect(card).toContainText("You objected");
    // Nothing is left to assent to, so there's nothing to sign.
    await expect(panel).toBeHidden();
  });

  test("one circular carries two resolutions, answered one by one", async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const first = `E2E first of two ${stamp}`;
    const second = `E2E second of two ${stamp}`;
    await draft(page, first);
    await draft(page, second);
    await issue(page, [first]);
    // The draft the dialog opened from comes first, the one added after it.
    await expect(
      page.getByRole("heading", { level: 2 }).filter({ hasText: /E2E/ })
    ).toHaveText([second, first]);
    const panel = page.getByRole("region", { name: "Your signature" });
    await expect(panel).toContainText("Signing assents to resolutions 1, 2");

    await resolutionCard(page, first)
      .getByRole("button", { name: "Object to resolution 2" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Object to this resolution",
    });
    await dialog.getByLabel("Reason").fill("Not this one.");
    await dialog.getByRole("button", { name: "Record objection" }).click();
    await confirmIfAsked(page);
    await expect(panel).toContainText(
      "Signing assents to resolution 1 and records that you object to resolution 2",
      { timeout: 15_000 }
    );
    // The first resolution is still open; the second failed on its own.
    await expect(
      resolutionCard(page, second).getByText("Issued", { exact: true })
    ).toBeVisible();
    await expect(
      resolutionCard(page, first).getByText("Failed", { exact: true })
    ).toBeVisible();
  });

  test("a conflicted trustee steps aside, and the issuer can withdraw", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular withdrawn ${Date.now()}`;
    await draft(page, title);
    await issue(page);
    const card = resolutionCard(page, title);
    await card
      .getByRole("button", {
        name: "Declare a conflict of interest on resolution 1",
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Declare a conflict of interest",
    });
    await dialog.getByLabel("What is the interest?").fill("Related party.");
    await dialog.getByRole("button", { name: "Declare conflict" }).click();
    await confirmIfAsked(page);
    await expect(card).toContainText("You declared a conflict of interest", {
      timeout: 15_000,
    });
    await expect(card).toContainText("0 of 1 signatures");
    await expect(
      page.getByRole("region", { name: "Your signature" })
    ).toBeHidden();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Withdraw circular" }).click();
    const withdraw = page.getByRole("dialog", {
      name: "Withdraw this circular",
    });
    await withdraw.getByLabel("Reason").fill("Wrong wording.");
    await withdraw.getByRole("button", { name: "Withdraw" }).click();
    await expect(card.getByText("Withdrawn", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("records a past resolution so the series continues", async ({
    page,
  }) => {
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "More actions" }).click();
    await page
      .getByRole("menuitem", { name: "Record a past resolution" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Record a past resolution",
    });
    const number = `PI/TR/2019-20/${String(Date.now()).slice(-3)}`;
    await dialog.getByRole("textbox", { name: "Number" }).fill(number);
    await dialog
      .getByRole("textbox", { name: "Title" })
      .fill("Opening of the bank account");
    await dialog
      .getByRole("button", { exact: true, name: "Passed on" })
      .click();
    await page
      .getByRole("dialog")
      .last()
      .locator("button[data-day]")
      .first()
      .click();
    await dialog.getByRole("button", { name: "Record resolution" }).click();
    await expect(page.getByText("Resolution recorded")).toBeVisible();
    await expect(dialog).toBeHidden();
    // Earlier runs' circulars sort first, so find the row by its number.
    await page.getByPlaceholder("Search resolutions...").fill(number);
    await expect(
      page.getByRole("row").filter({ hasText: number }).first()
    ).toContainText("recorded from paper");
  });
});

test.describe("resolution text", () => {
  test("drafts a resolution with bold text and a table", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    const title = `E2E rich text ${Date.now()}`;
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    // The template's lead words are bold, so typing over them stays bold.
    await writeText(page, dialog, "RESOLVED THAT");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type(" the budget be approved under these heads:");
    await page.keyboard.press("Enter");
    await insert(page, dialog, "Table");
    await dialog.getByRole("columnheader").first().click();
    // A 3 by 3 table with a header row; Tab moves to the next cell.
    for (const cell of ["Head", "Purpose", "Amount", "Kalakriti", "Prizes"]) {
      await page.keyboard.type(cell);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.type("4,50,000");
    await page.getByRole("button", { name: "Insert row after" }).click();
    await dialog.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 20_000,
    });
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(
      table.getByRole("columnheader", { name: "Head" })
    ).toBeVisible();
    await expect(table.getByRole("cell", { name: "4,50,000" })).toBeVisible();
    await expect(
      page.locator("strong").filter({ hasText: /^RESOLVED THAT$/ })
    ).toBeVisible();
    await expect(
      page.locator("strong").filter({ hasText: "the budget" })
    ).toHaveCount(0);
  });

  test("keeps pasted and indented lists within six levels", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    const title = `E2E deep list ${Date.now()}`;
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await writeText(page, dialog, "RESOLVED THAT:");
    // Eight bulleted levels, with a numbered list inside the first bullet.
    const deep = Array.from({ length: 8 }, (_, i) => `level${String(i + 1)}`)
      .reverse()
      .reduce((inner, text) => `<ul><li>${text}${inner}</li></ul>`, "")
      .replace("level1", "level1<ol><li>numbered</li></ol>");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (html) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob(["levels"], { type: "text/plain" }),
        }),
      ]);
    }, deep);
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+v");
    const editor = dialog.getByRole("textbox", { name: "Text" });
    await expect(editor).toContainText("level8");
    // Deeper items moved up a level; Tab and Indent can't go past six.
    await expect(editor.locator("ul ul ul ul ul ul ul")).toHaveCount(0);
    await editor.getByText("level8").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("level9");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Indent" })).toBeDisabled();
    await expect(editor.locator("ul ul ul ul ul ul ul")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("level9")).toBeVisible();
    // A numbered list inside a bulleted one counts from 1, as in the PDF.
    await expect(
      page.locator("ul ol").filter({ hasText: "numbered" }).first()
    ).toHaveCSS("list-style-type", "decimal");
  });

  test("drafts a resolution with a heading, a quote, a link and merged cells", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    const title = `E2E document text ${Date.now()}`;
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    const editor = dialog.getByRole("textbox", { name: "Text" });

    // A document offers no fourth heading, code, images or to-do lists.
    await writeText(page, dialog, "RESOLVED THAT the Board adopts:");
    await dialog.getByLabel("Turn into", { exact: true }).click();
    await expect(
      page.getByRole("menuitemradio", { name: "Heading 3" })
    ).toBeVisible();
    for (const name of ["Code", "Toggle list", "To-do list"]) {
      await expect(page.getByRole("menuitemradio", { name })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await dialog.getByLabel("Insert", { exact: true }).click();
    for (const name of ["Code", "Image", "Toggle list", "To-do list"]) {
      await expect(
        page.getByRole("menuitem", { exact: true, name })
      ).toHaveCount(0);
    }
    await page.keyboard.press("Escape");

    await editor.getByText("RESOLVED THAT the Board adopts:").click();
    await insert(page, dialog, "Heading 2");
    await page.keyboard.type("Schedule of duties");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Clause 4.2 reads:");
    await insert(page, dialog, "Quote");
    await page.keyboard.type("No adult is alone with a child.");
    // Enter on an empty line leaves the quote.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Duties:");

    // A new table has the cursor in its first cell.
    await insert(page, dialog, "Table");
    for (const cell of ["Duty", "Owner", "Review"]) {
      await page.keyboard.type(cell);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.type("Total");
    // Cells merge across a row, never down a column.
    const cells = editor.locator("td[data-table-cell-id]");
    // A selection dragged across cells, in steps as a hand moves.
    const drag = async (from: Locator, to: Locator) => {
      const a = (await from.boundingBox())!;
      const b = (await to.boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
        steps: 10,
      });
      await page.mouse.up();
    };
    const selected = editor.locator('[data-table-cell-selected="true"]');
    const merge = page.getByRole("button", { name: "Merge cells" });
    await drag(cells.nth(0), cells.nth(3));
    await expect(selected).toHaveCount(2);
    // The table's toolbar for selected cells waits 150ms before showing.
    await page.waitForTimeout(500);
    await expect(merge).toHaveCount(0);
    // Dragging from selected cells would move them, so collapse it first.
    await cells.nth(2).click();
    await drag(cells.nth(0), cells.nth(1));
    await expect(selected).toHaveCount(2);
    await merge.click();
    await expect(editor.locator('td[colspan="2"]')).toHaveText("Total");

    // The line after the table.
    await editor.locator(':scope > [data-slate-node="element"]').last().click();
    await page.keyboard.type("Read the policy");
    for (let i = 0; i < "the policy".length; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    // Slate reads the browser's selection at most every 100ms.
    await page.waitForTimeout(200);
    await dialog.getByLabel("Link", { exact: true }).click();
    await expect(page.getByPlaceholder("Text to display")).toHaveValue(
      "the policy"
    );
    // An address without a scheme is a web address.
    await page.getByPlaceholder("Paste link").fill("proudindian.ngo/policies");
    await page.keyboard.press("Enter");
    await expect(
      editor.getByRole("link", { name: "the policy" })
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { level: 2, name: "Schedule of duties" })
    ).toBeVisible();
    await expect(page.locator("blockquote")).toHaveText(
      "No adult is alone with a child."
    );
    await expect(
      page.getByRole("link", { name: "the policy" })
    ).toHaveAttribute("href", "https://proudindian.ngo/policies");
    await expect(page.locator('td[colspan="2"]')).toHaveText("Total");
  });

  test("reaches every table action on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    // iPhone 12 Pro.
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await writeText(page, dialog, "RESOLVED THAT:");
    await page.keyboard.press("Enter");
    // Phones keep one toolbar row; blocks come from the slash menu.
    await page.keyboard.type("/table");
    await page.keyboard.press("Enter");
    await dialog.getByRole("columnheader").first().click();
    for (const name of [
      "Delete table",
      "Insert row before",
      "Insert row after",
      "Delete row",
      "Insert column before",
      "Insert column after",
      "Delete column",
    ]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x, name).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(390);
    }
    // A document's table has no colours or border styles to pick.
    await expect(
      page.getByRole("button", { name: "Background color" })
    ).toHaveCount(0);
    // Columns stop at the cap: three now, five more allowed.
    const addColumn = page.getByRole("button", { name: "Insert column after" });
    for (let i = 0; i < 5; i++) {
      await addColumn.click();
    }
    await expect(addColumn).toBeDisabled();
  });
});

test.describe("circular resolutions (another trustee)", () => {
  test("the Joint Managing Trustee can't issue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin test");
    await page.goto("/governance/resolutions");
    const title = `E2E circular by JMT ${Date.now()}`;
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Issue" }).click();
    await page
      .getByRole("dialog", { name: "Issue a circular" })
      .getByRole("button", { name: "Issue to the trustees" })
      .click();
    await expect(
      page.getByText(/Only the Managing Trustee can issue/)
    ).toBeVisible();
  });
});
