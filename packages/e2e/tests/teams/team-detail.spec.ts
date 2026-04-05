import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { TeamDetailPage } from "../../pages/team-detail-page";

// Member cards display the user's NAME, not email — use the seeded volunteer name
const VOLUNTEER_NAME = "Test Volunteer";

/**
 * Creates a new team and navigates to its detail page.
 * Returns the team name.
 */
async function createAndNavigateToTeam(
  page: import("@playwright/test").Page
): Promise<string> {
  await page.goto("/teams");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

  const teamName = `E2E Detail Team ${Date.now()}`;
  await page.getByRole("button", { name: "Add team" }).click();
  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Name", { exact: true }).fill(teamName);
  await createDialog
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(createDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Team created")).toBeVisible();

  // Reload to force a fresh Zero sync — mutation is server-confirmed but Zero client
  // view can lag. A reload + waitForZeroReady guarantees the new team is in the view.
  await page.reload();
  await waitForZeroReady(page);

  // Navigate to the team detail page by clicking the team row link
  const teamRow = page.getByRole("row").filter({ hasText: teamName });
  await expect(teamRow).toBeVisible({ timeout: 20_000 });
  // Click the row title button (teams table uses data-testid="row-title")
  await teamRow.getByTestId("row-title").click();
  await page.waitForURL(/\/teams\/[a-z0-9-]+/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 10_000,
  });

  return teamName;
}

test.describe("Team detail — member management (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("navigates to team detail and shows members heading", async ({
    page,
  }) => {
    await createAndNavigateToTeam(page);
    const teamDetail = new TeamDetailPage(page);

    // Members section heading with count
    await expect(teamDetail.getMembersHeading()).toBeVisible({
      timeout: 10_000,
    });
    await expect(teamDetail.getAddMemberButton()).toBeVisible();
  });

  test("adds a volunteer as a member", async ({ page, volunteerEmail }) => {
    test.slow();
    await createAndNavigateToTeam(page);
    const teamDetail = new TeamDetailPage(page);

    await teamDetail.addMember(volunteerEmail);

    await expect(page.getByText("Member added")).toBeVisible({
      timeout: 10_000,
    });
    // Member row should appear with "Member" role badge
    await expect(teamDetail.getMemberRow(VOLUNTEER_NAME)).toBeVisible({
      timeout: 10_000,
    });
    await expect(teamDetail.getMemberRoleBadge(VOLUNTEER_NAME)).toContainText(
      "Member",
      { timeout: 5000 }
    );
  });

  test("promotes a member to lead", async ({ page, volunteerEmail }) => {
    test.slow();
    await createAndNavigateToTeam(page);
    const teamDetail = new TeamDetailPage(page);

    // Add member first
    await teamDetail.addMember(volunteerEmail);
    await expect(page.getByText("Member added")).toBeVisible({
      timeout: 10_000,
    });
    await expect(teamDetail.getMemberRow(VOLUNTEER_NAME)).toBeVisible({
      timeout: 10_000,
    });

    // Promote to lead
    await teamDetail.promoteMember(VOLUNTEER_NAME);

    // Badge should change to "Lead"
    await expect(teamDetail.getMemberRoleBadge(VOLUNTEER_NAME)).toContainText(
      "Lead",
      { timeout: 10_000 }
    );
  });

  test("cannot demote sole lead — shows warning", async ({
    page,
    volunteerEmail,
  }) => {
    test.slow();
    await createAndNavigateToTeam(page);
    const teamDetail = new TeamDetailPage(page);

    // Add as member, promote to lead (sole lead)
    await teamDetail.addMember(volunteerEmail);
    await expect(page.getByText("Member added")).toBeVisible({
      timeout: 10_000,
    });
    await expect(teamDetail.getMemberRow(VOLUNTEER_NAME)).toBeVisible({
      timeout: 10_000,
    });
    await teamDetail.promoteMember(VOLUNTEER_NAME);
    await expect(teamDetail.getMemberRoleBadge(VOLUNTEER_NAME)).toContainText(
      "Lead",
      { timeout: 10_000 }
    );

    // Try to demote — blocked because they're the only lead
    await teamDetail.demoteMember(VOLUNTEER_NAME);
    await expect(page.getByText(/Cannot demote the last lead/i)).toBeVisible({
      timeout: 5000,
    });
    // Badge should still be "Lead"
    await expect(teamDetail.getMemberRoleBadge(VOLUNTEER_NAME)).toContainText(
      "Lead"
    );
  });

  test("removes a member from the team", async ({ page, volunteerEmail }) => {
    test.slow();
    await createAndNavigateToTeam(page);
    const teamDetail = new TeamDetailPage(page);

    // Add member first
    await teamDetail.addMember(volunteerEmail);
    await expect(page.getByText("Member added")).toBeVisible({
      timeout: 10_000,
    });

    // Verify member row visible then remove
    const memberRow = teamDetail.getMemberRow(VOLUNTEER_NAME);
    await expect(memberRow).toBeVisible({ timeout: 10_000 });

    await teamDetail.removeMember(VOLUNTEER_NAME);

    // Member row should disappear
    await expect(memberRow).toBeHidden({ timeout: 10_000 });
  });
});

test.describe("Team detail — volunteer view", () => {
  test("volunteer can view team detail but cannot manage members", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/teams");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    // Check if any team exists to navigate to
    const firstTeamLink = page.getByRole("table").getByRole("link").first();
    const hasTeams = await firstTeamLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!hasTeams) {
      test.skip(true, "No teams visible to volunteer");
      return;
    }

    await firstTeamLink.click();
    await page.waitForURL(/\/teams\/[a-z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Volunteer should see the members section heading
    await expect(page.getByRole("heading", { name: /Members/ })).toBeVisible({
      timeout: 10_000,
    });

    // But should NOT see Add Member button
    await expect(page.getByRole("button", { name: "Add Member" })).toBeHidden();
  });
});
