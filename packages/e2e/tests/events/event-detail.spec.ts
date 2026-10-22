import { expect, test } from "../../fixtures/test";
import { openPageAction, pageActionsButton } from "../../helpers/page-header";
import { openPublicEvent, openSeededTeamEvent } from "../../helpers/team-event";

/** Seeded public, upcoming event in "E2E Updates Team". */
const PUBLIC_EVENT = "E2E Upcoming Public Bangalore";
const PUBLIC_EVENT_TEAM = "E2E Updates Team";

test.describe("Event detail page", () => {
  test("admin opens an event from public events and sees its info", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openPublicEvent(page, PUBLIC_EVENT);
    await expect(
      page.getByRole("heading", { level: 1, name: PUBLIC_EVENT })
    ).toBeVisible();
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/\d{1,2} \w{3} \d{4}/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByText("Public", { exact: true })
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expect(page.locator("#main")).toContainText("MG Road, Bangalore", {
      timeout: 10_000,
    });
    await expect(page.getByText(PUBLIC_EVENT_TEAM).first()).toBeVisible();
    // The header badge sits beside the title; other sessions on the page can
    // show their own Upcoming badges.
    await expect(
      page
        .getByRole("heading", { level: 1 })
        .locator("xpath=..")
        .getByText("Upcoming", { exact: true })
    ).toBeVisible();
  });

  test("admin sees Edit and Cancel event actions for future events", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeamEvent(page, PUBLIC_EVENT);
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(await openPageAction(page, "Cancel event")).toBeVisible();
  });

  test("volunteer views a public event without manage actions", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await openPublicEvent(page, PUBLIC_EVENT);
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();
    await expect(pageActionsButton(page)).toBeHidden();
    await expect(page.getByRole("tab", { name: "Expenses" })).not.toBeVisible();
  });

  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 844, width: 390 },
  ]) {
    test(`edit form opens and resets after cancellation at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
      await page.setViewportSize(viewport);
      await openPublicEvent(page, PUBLIC_EVENT);
      await page.getByRole("button", { exact: true, name: "Edit" }).click();

      const dialog = page.getByRole("dialog");
      const name = dialog.getByRole("textbox", { exact: true, name: "Name" });
      await expect(name).toHaveValue(PUBLIC_EVENT);
      await name.fill("Unsaved event name");
      await dialog.getByRole("button", { exact: true, name: "Cancel" }).click();
      await expect(dialog).toBeHidden();

      await page.getByRole("button", { exact: true, name: "Edit" }).click();
      await expect(name).toHaveValue(PUBLIC_EVENT);
      await dialog.getByRole("button", { exact: true, name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    });
  }
});
