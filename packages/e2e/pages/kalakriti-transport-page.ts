import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { KalakritiCentersPage } from "./kalakriti-centers-page";
import { ListPage } from "./list-page";

export class KalakritiTransportPage {
  constructor(readonly page: Page) {}

  async goto(year: number, centerName: string) {
    const centers = new KalakritiCentersPage(this.page);
    await centers.goto(year);
    await new ListPage(this.page).openRowActionAndClick(
      centers.center(centerName),
      "View details"
    );
    await expect(
      this.page.getByRole("heading", { name: centerName, exact: true })
    ).toBeVisible();
    await waitForZeroReady(this.page);
  }

  async addVehicle(vehicle: string, driver: string) {
    await this.page
      .getByRole("button", { name: "Add vehicle", exact: true })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Add transport assignment",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Vehicle").fill(vehicle);
    await dialog.getByLabel("Driver name").fill(driver);
    await dialog.getByLabel("Capacity").fill("40");
    await dialog
      .getByRole("button", { name: "Add vehicle", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      this.page.getByRole("heading", { name: vehicle, exact: true })
    ).toBeVisible();
  }

  async editVehicle(previousVehicle: string, vehicle: string, driver: string) {
    await this.page
      .getByRole("button", { name: "Edit", exact: true })
      .last()
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Edit transport assignment",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Vehicle")).toHaveValue(previousVehicle);
    await dialog.getByLabel("Vehicle").fill(vehicle);
    await dialog.getByLabel("Driver name").fill(driver);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      this.page.getByRole("heading", { name: vehicle, exact: true })
    ).toBeVisible();
    await expect(
      this.page.getByText(`Driver: ${driver}`, { exact: true })
    ).toBeVisible();
  }
}
