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
    return this.page.getByRole("button", { name: "Add Member" });
  }

  getMemberRow(nameOrEmail: string): Locator {
    return this.page
      .locator("[class*='border']")
      .filter({ hasText: nameOrEmail });
  }

  getMemberRoleBadge(nameOrEmail: string): Locator {
    return this.getMemberRow(nameOrEmail).locator("[data-slot='badge']");
  }

  /**
   * Opens the Add Member dialog and selects a user by searching name or email.
   * Waits for the option to appear and clicks it, then clicks "Add Member".
   */
  async addMember(nameOrEmail: string): Promise<void> {
    await this.getAddMemberButton().click();
    const addDialog = this.page.getByRole("dialog", { name: /Add Member/i });
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
    await addDialog.getByRole("button", { name: "Add Member" }).click();
    await expect(addDialog).toBeHidden({ timeout: 10_000 });
  }

  /**
   * Promotes a member (Member → Lead) by clicking their Promote button.
   */
  async promoteMember(nameOrEmail: string): Promise<void> {
    const memberRow = this.getMemberRow(nameOrEmail);
    await memberRow.getByRole("button", { name: "Promote" }).click();
  }

  /**
   * Demotes a lead (Lead → Member) by clicking their Demote button.
   */
  async demoteMember(nameOrEmail: string): Promise<void> {
    const memberRow = this.getMemberRow(nameOrEmail);
    await memberRow.getByRole("button", { name: "Demote" }).click();
  }

  /**
   * Removes a member by clicking their remove icon and confirming the dialog.
   */
  async removeMember(name: string): Promise<void> {
    const removeBtn = this.page.getByRole("button", {
      name: `Remove ${name}`,
    });
    await removeBtn.click();

    const confirmDialog = this.page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Remove member")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Remove" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
  }
}
