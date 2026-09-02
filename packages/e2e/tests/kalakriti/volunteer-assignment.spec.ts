import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiEditionPage } from "../../pages/kalakriti-edition-page";

const VOLUNTEER_NAME = "Test Volunteer";
const RESPONSIBILITY = "Overall Events Lead";
const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-volunteer-assignment.ts"
);

test.describe.configure({ mode: "serial" });

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("assigns a central volunteer and synchronizes linked-event access", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin volunteer assignment flow"
  );
  test.slow();
  const { year } = await fixture<{ year: number }>("setup", superAdminEmail);
  const editionPage = new KalakritiEditionPage(page);

  try {
    await editionPage.gotoVolunteers(year);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("button", { name: "Add volunteers" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Assign role" })).toHaveCount(
      0
    );

    await editionPage.addVolunteers(VOLUNTEER_NAME);
    expect(await fixture("state")).toEqual({
      assignments: [],
      eventMember: true,
      membershipState: "active",
    });

    await editionPage.assignRoleFromRow(VOLUNTEER_NAME, RESPONSIBILITY);
    expect(await fixture("state")).toEqual({
      assignments: ["overall_events_lead"],
      eventMember: true,
      membershipState: "active",
    });

    await editionPage.removeVolunteer(VOLUNTEER_NAME, RESPONSIBILITY);
    expect(await fixture("state")).toEqual({
      assignments: [],
      eventMember: true,
      membershipState: "active",
    });
    await expect(page.getByText("Unassigned", { exact: true })).toBeVisible();

    await editionPage.removeFromEdition(VOLUNTEER_NAME);
    expect(await fixture("state")).toEqual({
      assignments: [],
      eventMember: false,
      membershipState: "archived",
    });
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});

test("assigns a per-center Liaison Lead from the Volunteers page", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin volunteer assignment flow"
  );
  test.slow();
  const { centerName, year } = await fixture<{
    centerName: string;
    year: number;
  }>("setup", superAdminEmail);
  const editionPage = new KalakritiEditionPage(page);

  try {
    await editionPage.gotoVolunteers(year);
    await waitForZeroReady(page);
    await editionPage.addVolunteers(VOLUNTEER_NAME);
    await editionPage.assignRoleFromRow(VOLUNTEER_NAME, "Liaison Lead", {
      center: centerName,
    });
    expect(await fixture("state")).toEqual({
      assignments: ["center_liaison_lead"],
      eventMember: true,
      membershipState: "active",
    });
    await expect(page.getByText(`Liaison Lead · ${centerName}`)).toBeVisible();

    await editionPage.removeVolunteer(VOLUNTEER_NAME, "Liaison Lead");
    expect(await fixture("state")).toEqual({
      assignments: [],
      eventMember: true,
      membershipState: "active",
    });
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});

test("lets an authorized actor edit Kalakriti-linked event details", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin linked event edit flow"
  );
  test.slow();
  await fixture<{ year: number }>("setup", superAdminEmail);
  const eventId = "019f0000-0019-7000-8000-000000001972";

  try {
    await page.goto(`/events/${eventId}`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("button", { exact: true, name: "Edit" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Volunteer" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add volunteers" })
    ).toHaveCount(0);

    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Event" });
    await expect(dialog.getByLabel("Public")).toHaveCount(0);
    const location = dialog.getByLabel("Location");
    await location.fill("https://maps.example.com/kalakriti-hall");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Event updated", { exact: true })
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("link", { name: "https://maps.example.com/kalakriti-hall" })
        .first()
    ).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});
