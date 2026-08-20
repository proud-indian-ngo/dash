import { expect, type Locator, type Page } from "@playwright/test";
import { waitForZeroReady } from "../fixtures/test";

export class KalakritiEntriesPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(year: number, competitionName = "Solo Dance") {
    await expect(async () => {
      await this.page.goto(`/kalakriti/${year}/entries`);
      await waitForZeroReady(this.page, 10_000);
      await expect(
        this.page.getByRole("heading", { exact: true, name: "Entries" })
      ).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
    await this.page
      .getByRole("link", { exact: true, name: competitionName })
      .first()
      .click();
    await expect(
      this.page.getByRole("heading", { name: competitionName })
    ).toBeVisible();
  }

  async openRegistrationForm(): Promise<Locator> {
    await this.page
      .locator("#main")
      .getByRole("button", { name: "Register Entry" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: /Register Competition (Entries|Group)/,
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async fillEntry(dialog: Locator, studentName: string): Promise<void> {
    await this.fillEntries(dialog, [studentName]);
  }

  async fillEntries(dialog: Locator, studentNames: string[]): Promise<void> {
    for (const studentName of studentNames) {
      // biome-ignore lint/performance/noAwaitInLoops: each selection updates the same combobox before the next search
      await dialog.getByLabel("Students").fill(studentName);
      await this.page
        .getByRole("option", { name: new RegExp(studentName) })
        .click();
    }
  }

  async selectGroupMembers(
    dialog: Locator,
    studentNames: readonly string[]
  ): Promise<void> {
    const studentInput = dialog.getByLabel("Group members");
    for (const studentName of studentNames) {
      // biome-ignore lint/performance/noAwaitInLoops: each selection updates the Combobox before the next Student can be selected
      await studentInput.click();
      await this.page
        .getByRole("option", { name: new RegExp(studentName) })
        .click();
    }
    await studentInput.press("Escape");
  }

  async fillGroup(
    dialog: Locator,
    studentNames: readonly string[]
  ): Promise<void> {
    await this.selectGroupMembers(dialog, studentNames);
  }

  async removeLastGroupMember(dialog: Locator): Promise<void> {
    await dialog.getByLabel("Group members").press("Backspace");
  }

  async register(studentName: string): Promise<void> {
    await this.registerMany([studentName]);
  }

  async registerMany(studentNames: string[]): Promise<void> {
    const dialog = await this.openRegistrationForm();
    await this.fillEntries(dialog, studentNames);
    await dialog.getByRole("button", { name: "Register Entries" }).click();
    await expect(dialog).toBeHidden();
  }

  async attachMusic(locator: Locator, fileName = "track.mp3"): Promise<void> {
    const input = locator.getByTestId("entry-music-upload");
    await locator
      .getByRole("button", { name: "Upload audio" })
      .scrollIntoViewIfNeeded();
    await expect(input).toBeEnabled();
    await input.setInputFiles({
      buffer: TINY_MP3,
      mimeType: "audio/mpeg",
      name: fileName,
    });
  }

  async expectMusicDownloadOk(
    locator: Locator,
    fileName: string
  ): Promise<void> {
    const link = locator.getByRole("link", { name: fileName });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    if (!href) {
      throw new Error("Missing music download href");
    }
    const authorized = await this.page.request.get(href);
    expect(authorized.status()).toBe(200);
    const anonymous = await this.page.request.get(href, {
      headers: { Cookie: "" },
    });
    expect(anonymous.status()).toBe(401);
  }
}

const TINY_MP3 = Buffer.from([
  0x49,
  0x44,
  0x33,
  0x03,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0xff,
  0xfb,
  0x90,
  0x00,
  ...Array.from({ length: 64 }, () => 0),
]);
