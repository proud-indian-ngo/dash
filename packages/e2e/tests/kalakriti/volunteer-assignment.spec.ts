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
    await editionPage.goto(year);
    await waitForZeroReady(page);
    await editionPage.assignVolunteer(VOLUNTEER_NAME, RESPONSIBILITY);
    expect(await fixture("state")).toEqual({
      assignments: ["overall_events_lead"],
      eventMember: true,
      membershipState: "active",
    });

    await editionPage.removeVolunteer(VOLUNTEER_NAME, RESPONSIBILITY);
    expect(await fixture("state")).toEqual({
      assignments: [],
      eventMember: false,
      membershipState: "archived",
    });
  } finally {
    await fixture("cleanup");
  }
});
