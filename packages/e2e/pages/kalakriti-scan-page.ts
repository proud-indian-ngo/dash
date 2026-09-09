import type { Page } from "@playwright/test";

import { expect, waitForZeroReady } from "../fixtures/test";

type DecoderWindow = Window & {
  stationScan?: (text: string) => void;
  stationHeldScan?: (text: string) => void;
  stationCameraFails?: boolean;
  stationScannerStarts?: number;
};

export class KalakritiScanPage {
  constructor(readonly page: Page) {}
  get dialog() {
    return this.page.getByRole("dialog", {
      name: "Scan Students",
      exact: true,
    });
  }

  async installDecoder() {
    // Simulate camera/decoder callbacks only; UI, Zero, authorization and DB stay real.
    await this.page.route(/\/html5-qrcode[^/]*\.js/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export class Html5Qrcode {
        async start(camera, options, onScan) {
          window.stationScannerStarts = (window.stationScannerStarts || 0) + 1;
          if (window.stationCameraFails) throw new Error('Simulated camera unavailable');
          window.stationScan = onScan;
        }
        async stop() { delete window.stationScan; }
        clear() {}
      }`,
      })
    );
  }
  async goto(year: number, section: "centers" | "students" = "centers") {
    await this.page.goto(`/kalakriti/${year}/${section}`);
    await expect(
      this.page.getByRole("heading", {
        name: section === "centers" ? "Centers" : "Students",
        exact: true,
      })
    ).toBeVisible();
    await waitForZeroReady(this.page);
  }
  async open(center?: string) {
    if ((this.page.viewportSize()?.width ?? 1024) < 768)
      await this.openFromMobileSidebar();
    else
      await this.page
        .getByRole("button", { name: "Scan", exact: true })
        .click();
    await expect(this.dialog).toBeVisible();
    if (center) await this.selectCenter(center);
  }
  async openFromMobileSidebar() {
    await this.page
      .getByRole("button", { name: "Toggle Sidebar", exact: true })
      .last()
      .click();
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: "Scan", exact: true })
      .click();
    await expect(this.dialog).toBeVisible();
    await expect(this.page.getByRole("dialog")).toHaveCount(1);
  }
  async selectCenter(name: string) {
    await this.dialog
      .getByRole("combobox", { name: "Center", exact: true })
      .click();
    await this.page.getByRole("option", { name, exact: true }).click();
    await expect(
      this.dialog.getByRole("combobox", { name: "Center", exact: true })
    ).toContainText(name);
  }
  async manual(humanId: string) {
    await this.dialog.getByLabel("Yearly ID").fill(humanId);
    await this.dialog
      .getByRole("button", { name: "Mark Student", exact: true })
      .click();
    await expect(
      this.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toBeEnabled();
  }
  async scan(personQr: string, frames = 1) {
    await expect
      .poll(() =>
        this.page.evaluate(() => typeof (window as DecoderWindow).stationScan)
      )
      .toBe("function");
    await this.page.evaluate(
      ({ personQr, frames }) => {
        for (let i = 0; i < frames; i++)
          (window as DecoderWindow).stationScan!(personQr);
      },
      { personQr, frames }
    );
  }
  async holdFrame() {
    await this.page.evaluate(() => {
      (window as DecoderWindow).stationHeldScan = (
        window as DecoderWindow
      ).stationScan;
    });
  }
  async emitHeldFrame(personQr: string) {
    await this.page.evaluate((qr) => {
      (window as DecoderWindow).stationHeldScan?.(qr);
    }, personQr);
  }
  async expectStarts(count: number) {
    await expect
      .poll(() =>
        this.page.evaluate(
          () => (window as DecoderWindow).stationScannerStarts ?? 0
        )
      )
      .toBe(count);
  }
  async failCamera(fails = true) {
    await this.page.evaluate((fails) => {
      (window as DecoderWindow).stationCameraFails = fails;
    }, fails);
  }
  async expectCameraActive(active: boolean) {
    await expect
      .poll(() =>
        this.page.evaluate(() => typeof (window as DecoderWindow).stationScan)
      )
      .toBe(active ? "function" : "undefined");
  }
  async close() {
    await this.dialog
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(this.dialog).toBeHidden();
  }
  async finish(label: string) {
    await this.dialog
      .getByRole("button", { name: "Finish stage", exact: true })
      .click();
    const confirmation = this.page.getByRole("alertdialog", {
      name: `Finish ${label}?`,
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "Finish stage", exact: true })
      .click();
    await expect(this.dialog).toBeHidden();
  }
}
