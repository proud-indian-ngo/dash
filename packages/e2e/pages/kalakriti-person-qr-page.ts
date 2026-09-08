import { expect, type Locator, type Page } from "@playwright/test";
import jsQR from "jsqr";

import { waitForZeroReady } from "../fixtures/test";
import { ListPage } from "./list-page";

export class KalakritiPersonQrPage {
  constructor(readonly page: Page) {}

  async open(
    year: number,
    subject: "students" | "volunteers" | "guardians",
    name: string
  ) {
    await this.page.goto(`/kalakriti/${year}/${subject}`);
    await waitForZeroReady(this.page);
    if (subject === "students") {
      // Open from a non-name cell to cover whole-row detail navigation.
      await this.page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell")
        .filter({ hasText: /^(male|female)$/i })
        .click();
    } else {
      const list = new ListPage(this.page);
      await list.openRowActionAndClick(
        list.getRows().filter({ hasText: name }),
        "View details"
      );
    }
    const sheet = this.page.getByRole("dialog", { name, exact: true });
    await expect(sheet).toBeVisible();
    return sheet;
  }

  async decodeQr(sheet: Locator) {
    const qr = sheet.getByRole("img", { name: "Person QR code", exact: true });
    await expect(qr).toBeVisible();
    // Rasterize the rendered SVG rather than trusting its accessible label or props.
    const pixels = await qr.evaluate(async (svg) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not create QR decoding canvas");
      }
      context.fillStyle = "white";
      context.fillRect(0, 0, 512, 512);
      context.drawImage(image, 16, 16, 480, 480);
      return Array.from(context.getImageData(0, 0, 512, 512).data);
    });
    const decoded = jsQR(new Uint8ClampedArray(pixels), 512, 512);
    expect(decoded, "Rendered QR must decode").not.toBeNull();
    return decoded!.data;
  }
}
