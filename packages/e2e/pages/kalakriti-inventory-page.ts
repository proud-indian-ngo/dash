import { expect, type Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "./list-page";

export class KalakritiInventoryPage {
  constructor(readonly page: Page) {}

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/inventory`);
    await expect(
      this.page.getByRole("heading", { name: "Inventory", exact: true })
    ).toBeVisible();
    await waitForZeroReady(this.page);
  }

  item(name: string) {
    return this.page
      .getByRole("row")
      .filter({ has: this.page.getByRole("cell", { name, exact: true }) });
  }

  async create(name: string, quantity: number) {
    await this.page
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "Add inventory item",
      exact: true,
    });
    await dialog.getByLabel("Item name").fill(name);
    await dialog.getByLabel("Opening quantity").fill(String(quantity));
    await dialog.getByLabel("Unit price (₹)").fill("12.50");
    await dialog
      .getByRole("button", { name: "Create item", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(this.item(name)).toBeVisible();
  }

  async openAction(name: string, action: string) {
    await new ListPage(this.page).openRowActionAndClick(
      this.item(name),
      action
    );
  }

  async move(
    name: string,
    action: "Purchase" | "Adjust stock",
    quantity: number
  ) {
    await this.openAction(name, action);
    const label = action === "Adjust stock" ? "Adjustment" : action;
    const dialog = this.page.getByRole("dialog", {
      name: `${label} · ${name}`,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("spinbutton", {
        name: action === "Adjust stock" ? "Counted stock" : "Quantity",
        exact: true,
      })
      .fill(String(quantity));
    await dialog
      .getByRole("textbox", {
        name: action === "Adjust stock" ? "Reason" : "Purpose / notes",
        exact: true,
      })
      .fill(
        action === "Adjust stock" ? "Counted after event" : "Drawing supplies"
      );
    await dialog
      .getByRole("button", {
        name: `Record ${label.toLowerCase()}`,
        exact: true,
      })
      .click();
    await expect(dialog).toBeHidden();
  }

  async openScan(action: "Dispatch" | "Return") {
    await this.page.getByRole("button", { name: action, exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "Scan", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tabpanel", { name: action })).toBeVisible();
    return dialog;
  }

  async findVolunteer(humanId: string, name: string) {
    const dialog = this.page.getByRole("dialog", { name: "Scan", exact: true });
    const input = dialog.getByRole("textbox", {
      name: "Volunteer yearly ID",
    });
    if (!(await input.isVisible())) {
      await dialog
        .getByRole("button", { name: "Enter ID manually", exact: true })
        .click();
    }
    await input.fill(humanId);
    await dialog.getByRole("button", { name: "Find volunteer" }).click();
    const profile = dialog.getByRole("region", { name: "Scanned volunteer" });
    await expect(profile).toContainText(name);
    await expect(profile).toContainText(humanId);
    await expect(
      dialog.getByRole("heading", { name: "Scan volunteer QR" })
    ).toHaveCount(0);
    return dialog;
  }

  async selectItem(name: string, stock: number, quantity: number) {
    const dialog = this.page.getByRole("dialog", { name: "Scan", exact: true });
    await dialog.getByPlaceholder("Search inventory items...").fill(name);
    await this.page
      .getByRole("option", { name: `${name} · ${stock} in stock`, exact: true })
      .click();
    await dialog
      .getByRole("spinbutton", { name: `${name} quantity` })
      .fill(String(quantity));
  }
}
