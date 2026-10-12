import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for the Team Detail page (/teams/:id).
 * Encapsulates member management interactions.
 */
export class TeamDetailPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getMembersHeading(): Locator {
    return this.page.getByRole("heading", { name: /Members \(\d+\)/ });
  }

  getAddMemberButton(): Locator {
    return this.page.getByRole("button", { name: "Add member" });
  }

  getMemberRow(nameOrEmail: string): Locator {
    return this.page
      .locator("[data-slot='team-member-row']")
      .filter({ hasText: nameOrEmail });
  }

  /** Opens a member's row menu and picks an item. */
  private async chooseMemberAction(
    nameOrEmail: string,
    item: RegExp | string
  ): Promise<void> {
    const memberRow = this.getMemberRow(nameOrEmail);
    await expect(memberRow).toBeVisible({ timeout: 5000 });
    await memberRow.getByRole("button", { name: /^Actions for / }).click();
    await this.page.getByRole("menuitem", { name: item }).click();
  }

  getMemberRoleBadge(nameOrEmail: string): Locator {
    return this.getMemberRow(nameOrEmail).locator("[data-slot='tag']");
  }

  /**
   * Opens the Add member dialog and selects a user by searching name or email.
   * Waits for the option to appear and clicks it, then clicks "Add member".
   */
  async addMember(nameOrEmail: string): Promise<void> {
    await this.getAddMemberButton().click();
    const addDialog = this.page.getByRole("dialog", { name: /Add member/i });
    await expect(addDialog).toBeVisible();

    // Search for user in the picker
    await addDialog
      .getByPlaceholder("Search by name or email...")
      .fill(nameOrEmail);
    const option = this.page
      .getByRole("option")
      .filter({ hasText: nameOrEmail });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();

    // Submit
    await addDialog.getByRole("button", { name: "Add member" }).click();
    await expect(addDialog).toBeHidden({ timeout: 10_000 });
  }

  /** Promotes a member (Member → Lead) from their row menu. */
  async promoteMember(nameOrEmail: string): Promise<void> {
    await this.chooseMemberAction(nameOrEmail, "Promote to lead");
  }

  /** Demotes a lead (Lead → Member) from their row menu. */
  async demoteMember(nameOrEmail: string): Promise<void> {
    await this.chooseMemberAction(nameOrEmail, "Demote to member");
  }

  /**
   * Removes a member from their row menu and confirms the dialog.
   */
  async removeMember(name: string): Promise<void> {
    await this.chooseMemberAction(name, "Remove from team");

    const confirmDialog = this.page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Remove member")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Remove" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
  }
}
