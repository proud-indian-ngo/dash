import { expect, test } from "../../fixtures/test";
import { openPageAction } from "../../helpers/page-header";
import { openPublicEvent, openSeededTeamEvent } from "../../helpers/team-event";

/** Seeded public, upcoming event in "E2E Updates Team". */
const PUBLIC_EVENT = "E2E Upcoming Public Bangalore";

test.describe("Event detail page", () => {
  test("admin can navigate to event detail from public events", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openPublicEvent(page, PUBLIC_EVENT);
    await expect(
      page.getByRole("heading", { level: 1, name: PUBLIC_EVENT })
    ).toBeVisible();
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
  });

  test("event detail shows event info section", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openPublicEvent(page, PUBLIC_EVENT);
    await expect(page.getByText(/\d{1,2} \w{3} \d{4}/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByText("Public", { exact: true })
        .filter({ visible: true })
        .first()
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

  test("volunteer can view event detail for public event", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await openPublicEvent(page, PUBLIC_EVENT);
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).not.toBeVisible();
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
