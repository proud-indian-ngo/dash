// @e2e-areas teams
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/attendance-team.ts"
);

interface FixtureState {
  attendees: { attendance: string | null; email: string; role: string }[];
  teamMembers: { email: string; role: string }[];
}

const byEmail = (a: { email: string }, b: { email: string }) =>
  a.email.localeCompare(b.email);

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  ...args: string[]
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, ...args],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test.describe("Attendance orients new volunteers", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("marking an unoriented volunteer present orients them and adds them to the team", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    const fx = await fixture<{ eventId: string; newcomerEmail: string }>(
      "setup",
      volunteerEmail
    );

    try {
      await page.goto(`/events/${fx.eventId}`);

      await test.step("an unoriented newcomer marked present is oriented and joins the team", async () => {
        await page
          .getByRole("button", { name: "Mark Attendance Newcomer present" })
          .click();
        await expect
          .poll(async () => fixture<FixtureState>("state"))
          .toMatchObject({
            attendees: expect.arrayContaining([
              {
                attendance: "present",
                email: fx.newcomerEmail,
                role: "volunteer",
              },
            ]),
            teamMembers: [{ email: fx.newcomerEmail, role: "member" }],
          });
      });

      await test.step("mark all present leaves an oriented volunteer off the team", async () => {
        await page.getByRole("button", { name: "Mark all present" }).click();
        await expect
          .poll(async () => fixture<FixtureState>("state"))
          .toEqual({
            attendees: [
              {
                attendance: "present",
                email: fx.newcomerEmail,
                role: "volunteer",
              },
              {
                attendance: "present",
                email: volunteerEmail,
                role: "volunteer",
              },
            ].toSorted(byEmail),
            teamMembers: [{ email: fx.newcomerEmail, role: "member" }],
          });
      });

      const finalState = await fixture<FixtureState>("state");
      await testInfo.attach("attendance-team-state.json", {
        body: JSON.stringify(finalState, null, 2),
        contentType: "application/json",
      });
    } finally {
      await fixture("cleanup");
    }
  });
});
