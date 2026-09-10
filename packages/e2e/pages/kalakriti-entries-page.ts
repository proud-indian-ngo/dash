import { readFileSync } from "node:fs";

import {
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";

export class KalakritiEntriesPage {
  readonly page: Page;
  private readonly mediaResponses: Response[] = [];

  constructor(page: Page) {
    this.page = page;
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (
        url.pathname === "/api/attachments/download" &&
        url.searchParams.get("disposition") === "inline"
      )
        this.mediaResponses.push(response);
    });
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

  trackMusicUploadKeys(): Set<string> {
    const keys = new Set<string>();
    this.page.on("request", (request) => {
      if (
        request.method() !== "PUT" ||
        !request.url().includes("r2.cloudflarestorage.com")
      )
        return;
      let key = decodeURIComponent(new URL(request.url()).pathname).slice(1);
      const bucket = `${process.env.R2_BUCKET_NAME}/`;
      if (key.startsWith(bucket)) key = key.slice(bucket.length);
      keys.add(key);
    });
    return keys;
  }

  async openMusicDialog(edit = false): Promise<Locator> {
    const name = edit ? "Edit music" : "Upload music";
    const dialog = this.page.getByRole("dialog", { name, exact: true });
    await this.page.getByRole("button", { name, exact: true }).click();
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async saveMusic(dialog: Locator): Promise<void> {
    await dialog
      .getByRole("button", { name: "Save music", exact: true })
      .click();
    await expect(dialog).toBeHidden();
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
    const input = dialog.getByLabel("Students");
    for (const studentName of studentNames) {
      const option = this.page.getByRole("option", {
        name: new RegExp(studentName),
      });
      // The combobox popup can race its own close/re-open after a selection;
      // re-focus and re-fill until the matching option renders.
      await expect(async () => {
        await input.click();
        await input.fill(studentName);
        await expect(option).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await option.click();
    }
    // Selecting an option strands focus in the listbox portal, so a
    // page-level Escape never reaches the dialog. Send it through the
    // focused input instead.
    await input.press("Escape");
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
    await this.attachMusicFiles(locator, [fileName]);
  }

  async attachMusicFiles(locator: Locator, fileNames: string[]): Promise<void> {
    const input = locator.getByTestId("entry-music-upload");
    await locator
      .getByRole("button", { name: "Upload audio" })
      .scrollIntoViewIfNeeded();
    await expect(input).toBeEnabled();
    await input.setInputFiles(
      fileNames.map((name) => ({
        buffer: TEST_MP3,
        mimeType: "audio/mpeg",
        name,
      }))
    );
  }

  async expectMusicDownloadOk(
    locator: Locator,
    fileName: string
  ): Promise<void> {
    const dialog = await this.openMusicPlayback(locator, fileName);
    const link = dialog.getByRole("link", { name: "Download", exact: true });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    if (!href) {
      throw new Error("Missing music download href");
    }
    const authorized = await this.page.request.get(href);
    expect(authorized.status()).toBe(200);
    const downloadEvent = this.page.waitForEvent("download");
    await link.click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(fileName);
    expect(await download.failure()).toBeNull();
    const anonymous = await this.page.request.get(href, {
      headers: { Cookie: "" },
    });
    expect(anonymous.status()).toBe(401);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  async openMusicPlayback(
    locator: Locator,
    fileName: string
  ): Promise<Locator> {
    const pagesBefore = this.page.context().pages().length;
    await locator.getByRole("button", { name: fileName, exact: true }).click();
    const dialog = this.page.getByRole("dialog", {
      name: "Play music",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(this.page.context().pages()).toHaveLength(pagesBefore);
    await expect(
      dialog.getByRole("link", { name: "Download", exact: true })
    ).not.toHaveAttribute("target", "_blank");
    return dialog;
  }

  async expectAudioPlaysAndSeeks(
    dialog: Locator,
    fileName: string
  ): Promise<void> {
    const audio = dialog.getByLabel(`Play ${fileName}`, { exact: true });
    await expect(audio).toBeVisible();
    try {
      await audio.evaluate(async (element) => {
        const player = element as HTMLAudioElement;
        player.muted = true;
        await player.play();
      });
    } catch (error) {
      const responses = await Promise.all(
        this.mediaResponses.map(async (response) => ({
          url: response.url(),
          status: response.status(),
          contentType: response.headers()["content-type"],
          contentRange: response.headers()["content-range"],
          destination: response.request().headers()["sec-fetch-dest"],
          range: response.request().headers().range,
          body:
            response.status() >= 400
              ? (
                  await response.text().catch(() => "Response body unavailable")
                ).slice(0, 1024)
              : undefined,
        }))
      );
      const media = await audio.evaluate((element) => {
        const player = element as HTMLAudioElement;
        return {
          error: player.error?.code,
          message: player.error?.message,
          readyState: player.readyState,
          networkState: player.networkState,
        };
      });
      await test.info().attach("native-audio-diagnostics", {
        body: JSON.stringify({ media, responses }, null, 2),
        contentType: "application/json",
      });
      throw error;
    }
    await expect
      .poll(() =>
        audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
      )
      .toBeGreaterThan(0.25);
    const initial = await audio.evaluate((element) => {
      const player = element as HTMLAudioElement;
      return {
        duration: player.duration,
        error: player.error?.code ?? null,
        source: player.currentSrc,
      };
    });
    expect(initial.error).toBeNull();
    expect(initial.duration).toBeGreaterThan(9);
    const range = await this.page.request.get(initial.source, {
      headers: { Range: "bytes=1024-2047" },
    });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-type"]).toContain("audio/mpeg");
    expect(range.headers()["content-range"]).toMatch(/^bytes 1024-2047\/\d+$/);
    expect((await range.body()).byteLength).toBe(1024);
    const anonymous = await this.page.request.get(initial.source, {
      headers: { Cookie: "", Range: "bytes=0-1023" },
    });
    expect(anonymous.status()).toBe(401);
    await audio.evaluate((element) => {
      (element as HTMLAudioElement).currentTime = 6;
    });
    await expect
      .poll(() =>
        audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
      )
      .toBeGreaterThan(6.25);
    expect(
      await audio.evaluate(
        (element) => (element as HTMLAudioElement).error?.code ?? null
      )
    ).toBeNull();
  }
}

// Generated 10-second mono 440 Hz tone (24 kbps MP3), checked in so CI needs no encoder.
const TEST_MP3 = readFileSync(
  new URL("../fixtures/audio/track.mp3", import.meta.url)
);
