import type { Page } from "@playwright/test";

import { expect, waitForZeroReady } from "../fixtures/test";

type DecoderWindow = Window & { stationScan?: (text: string) => void };

export class KalakritiEventDayPage {
  constructor(readonly page: Page) {}

  async installDecoder() {
    // Replace camera hardware/decoding only; the application callback and mutations stay real.
    await this.page.route(/\/html5-qrcode[^/]*\.js/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export class Html5Qrcode {
        async start(camera, options, onScan) { window.stationScan = onScan; }
        async stop() { delete window.stationScan; }
        clear() {}
      }`,
      })
    );
  }

  async goto(year: number) {
    await this.page.goto(`/kalakriti/${year}/event-day`);
    await expect(
      this.page.getByRole("heading", { name: "Event day", exact: true })
    ).toBeVisible();
    await waitForZeroReady(this.page);
  }

  async checkpoint(name: "Pickup" | "Venue departure" | "Drop-off") {
    await this.page
      .getByRole("combobox", { name: "Transport checkpoint" })
      .click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }

  async manual(humanId: string) {
    await this.page.getByLabel("Yearly ID").fill(humanId);
    await this.page
      .getByRole("button", { name: "Record transport", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name: "Record transport", exact: true })
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
    await expect(
      this.page.getByRole("button", { name: "Record transport", exact: true })
    ).toBeEnabled();
  }
}
