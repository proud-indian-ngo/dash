import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "./list-page";

export class KalakritiTransportPage {
  private centerName = "";
  constructor(readonly page: Page) {}

  async goto(year: number, centerName: string) {
    this.centerName = centerName;
    await this.page.goto(`/kalakriti/${year}/transport`);
    await expect(
      this.page.getByRole("heading", { name: "Transport", exact: true })
    ).toBeVisible();
    await waitForZeroReady(this.page);
    await expect(
      this.page.getByRole("cell", { name: centerName, exact: true }).first()
    ).toBeVisible();
  }

  vehicle(vehicle: string) {
    return this.page.getByRole("row").filter({
      has: this.page.getByRole("cell", { name: vehicle, exact: true }),
    });
  }

  async addVehicle(vehicle: string, driver: string, pickupTime = "") {
    const row = this.page
      .getByRole("row")
      .filter({
        has: this.page.getByRole("cell", {
          name: this.centerName,
          exact: true,
        }),
      })
      .first();
    await new ListPage(this.page).openRowActionAndClick(row, "Add vehicle");
    const dialog = this.page.getByRole("dialog", {
      name: "Add transport assignment",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Vehicle number").fill(vehicle);
    await dialog.getByLabel("Driver name").fill(driver);
    await dialog.getByLabel("Capacity").fill("40");
    if (pickupTime) await dialog.getByLabel("Pickup time").fill(pickupTime);
    await dialog
      .getByRole("button", { name: "Add vehicle", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.vehicle(vehicle)).toBeVisible();
  }

  async openDelete(vehicle: string) {
    await new ListPage(this.page).openRowActionAndClick(
      this.vehicle(vehicle),
      "Delete vehicle"
    );
    const dialog = this.page.getByRole("alertdialog", {
      name: "Delete transport assignment?",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(vehicle);
    return dialog;
  }

  async deleteVehicle(vehicle: string) {
    const dialog = await this.openDelete(vehicle);
    await dialog
      .getByRole("button", { name: "Delete assignment", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.vehicle(vehicle)).toHaveCount(0);
  }

  async expectNoAdvanceControls() {
    for (const name of [
      "Arrived at Center",
      "Arrived at venue",
      "Departed venue",
      "Completed",
    ])
      await expect(
        this.page.getByRole("button", { name, exact: true })
      ).toHaveCount(0);
  }

  async editVehicle(previousVehicle: string, vehicle: string, driver: string) {
    await new ListPage(this.page).openRowActionAndClick(
      this.vehicle(previousVehicle),
      "Edit vehicle"
    );
    const dialog = this.page.getByRole("dialog", {
      name: "Edit transport assignment",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Vehicle number")).toHaveValue(
      previousVehicle
    );
    await dialog.getByLabel("Vehicle number").fill(vehicle);
    await dialog.getByLabel("Driver name").fill(driver);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.vehicle(vehicle)).toBeVisible();
    await expect(
      this.vehicle(vehicle).getByRole("cell", { name: driver, exact: true })
    ).toBeVisible();
  }
}
