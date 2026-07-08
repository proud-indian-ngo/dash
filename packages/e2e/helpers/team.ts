import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { clickUntilDialogCloses } from "./dialog-submit";

interface CreateTeamOptions {
  description?: string;
  prefix: string;
}

export async function createTeamViaDialog(
  page: Page,
  { description, prefix }: CreateTeamOptions
) {
  let lastTeamName = "";

  async function tryCreateTeam(attempt: number): Promise<string | undefined> {
    const teamName = `${prefix} ${Date.now()}${attempt ? ` ${attempt}` : ""}`;
    lastTeamName = teamName;

    await page.getByPlaceholder("Search teams...").fill("");
    await page.getByRole("button", { name: "Add team" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(teamName);
    if (description) {
      await dialog.getByLabel("Description").fill(description);
    }

    await clickUntilDialogCloses(dialog, "Create");
    await page.getByPlaceholder("Search teams...").fill(teamName);

    const rowTitle = page
      .getByTestId("row-title")
      .filter({ hasText: teamName })
      .first();
    if (await rowTitle.isVisible({ timeout: 20_000 }).catch(() => false)) {
      return teamName;
    }

    return attempt < 1 ? tryCreateTeam(attempt + 1) : undefined;
  }

  const createdTeamName = await tryCreateTeam(0);
  if (createdTeamName) {
    return createdTeamName;
  }

  await page.getByPlaceholder("Search teams...").fill(lastTeamName);
  await expect(
    page.getByTestId("row-title").filter({ hasText: lastTeamName }).first()
  ).toBeVisible({ timeout: 45_000 });

  return lastTeamName;
}
