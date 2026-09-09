import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Request } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiEntriesPage } from "../../pages/kalakriti-entries-page";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-entries.ts"
);
interface Fixture {
  year: number;
  editionId: string;
  entryId: string;
  centerId: string;
  divisionId: string;
  studentIds: string[];
}
interface State {
  entries: {
    id: string;
    musicFileName: string | null;
    musicObjectKey: string | null;
  }[];
  members: { entryId: string; studentId: string }[];
  audits: { action: string }[];
}
async function fixture<T>(action: string, argument?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, "music", ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}
async function mutate(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
) {
  const id = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `music-e2e-${id}`,
        mutations: [
          {
            args: [args],
            clientID: id,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
        pushVersion: 1,
        requestID: id,
        timestamp: Date.now(),
      },
    }
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.mutations).toHaveLength(1);
  return body.mutations[0].result as { error?: string; message?: string };
}
function command(entryId: string) {
  return { entryId, auditEntryId: uuidv7(), now: Date.now() };
}
async function replaySigner(request: APIRequestContext, original: Request) {
  return request.fetch(original.url(), {
    method: original.method(),
    headers: await original.allHeaders(),
    data: original.postDataBuffer()!,
  });
}

test.describe("Kalakriti entry music after registration closes", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "volunteer",
      "Scoped Liaison music workflow"
    );
  });

  test("opens a music-only modal after Center and Edition closure without unlocking participants", async ({
    page,
    volunteerEmail,
  }) => {
    test.slow();
    const data = await fixture<Fixture>("setup", volunteerEmail);
    const entries = new KalakritiEntriesPage(page);
    try {
      const original = await fixture<State>("state");
      for (const mode of ["center-closed", "edition-closed"]) {
        await fixture("music-mode", mode);
        await entries.goto(data.year, "Group Dance");
        const dialog = await entries.openMusicDialog();
        await expect(dialog.getByTestId("entry-music-upload")).toHaveCount(1);
        await expect(
          dialog.getByRole("button", { name: "Upload audio", exact: true })
        ).toBeVisible();
        await expect(dialog.getByLabel("Group members")).toHaveCount(0);
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await expect(dialog).toBeHidden();
        const denied = await mutate(
          page.request,
          "kalakritiEntry.replaceGroupMembers",
          {
            ...command(data.entryId),
            members: [
              { memberId: uuidv7(), studentId: data.studentIds[0] },
              { memberId: uuidv7(), studentId: data.studentIds[2] },
            ],
          }
        );
        expect(denied.error).toBeDefined();
        expect(denied.message).toMatch(
          /registration.*(closed|open)|registration_open/i
        );
        // A missing-file error proves the actual music mutation passed the closed-registration gate without an R2 write.
        const music = await mutate(
          page.request,
          "kalakritiEntry.removeMusic",
          command(data.entryId)
        );
        expect(music.message).toContain("No music file");
      }
      const after = await fixture<State>("state");
      expect(after.entries).toEqual(original.entries);
      expect(after.members).toEqual(original.members);
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("signing and mutation reject disabled Competitions, archives, and actors outside the Center scope", async ({
    page,
    volunteerEmail,
  }) => {
    test.slow();
    const data = await fixture<Fixture>("setup", volunteerEmail);
    const entries = new KalakritiEntriesPage(page);
    try {
      await fixture("music-mode", "edition-closed");
      await entries.goto(data.year, "Group Dance");
      const dialog = await entries.openMusicDialog();
      // Capture the real signer request. Abort the external PUT: this lane verifies authorization, not storage, and runs in CI.
      await page.route("**/*", async (route) => {
        if (
          route.request().method() === "PUT" &&
          new URL(route.request().url()).origin !== new URL(page.url()).origin
        )
          await route.abort();
        else await route.continue();
      });
      const signingResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          (response.request().postData()?.includes("authorization-probe.mp3") ??
            false)
      );
      const signing = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          (request.postData()?.includes("authorization-probe.mp3") ?? false)
      );
      await entries.attachMusic(dialog, "authorization-probe.mp3");
      const original = await signing;
      await signingResponse;
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      for (const mode of ["disabled", "archived", "unauthorized"]) {
        await fixture("music-mode", mode);
        const response = await replaySigner(page.request, original);
        const body = await response.text();
        expect(body).toMatch(/Forbidden|Unauthorized/);
        expect(body).not.toContain("X-Amz-Signature");
        const result = await mutate(
          page.request,
          "kalakritiEntry.attachOrReplaceMusic",
          {
            ...command(data.entryId),
            byteSize: 78,
            fileName: "denied.mp3",
            mimeType: "audio/mpeg",
            objectKey: "invalid-unclaimed-object",
          }
        );
        expect(result.error).toBeDefined();
        expect(result.message).toMatch(
          /music upload|archived|Unauthorized|Forbidden/i
        );
      }
      const state = await fixture<State>("state");
      expect(state.entries[0]?.musicObjectKey).toBeNull();
      expect(state.members.map((member) => member.studentId).sort()).toEqual(
        data.studentIds.slice(0, 2).sort()
      );
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("uploads after Center closure and replaces after Edition closure through explicit Save", async ({
    page,
    volunteerEmail,
  }) => {
    test.skip(
      Boolean(process.env.CI),
      "Real R2 smoke follows the existing local-only music upload convention"
    );
    test.slow();
    const data = await fixture<Fixture>("setup", volunteerEmail);
    const entries = new KalakritiEntriesPage(page);
    const uploadedKeys = entries.trackMusicUploadKeys();
    try {
      for (const [mode, filename, edit] of [
        ["center-closed", "music-initial.mp3", false],
        ["edition-closed", "music-replacement.mp3", true],
      ] as const) {
        await fixture("music-mode", mode);
        await entries.goto(data.year, "Group Dance");
        const dialog = await entries.openMusicDialog(edit);
        await entries.attachMusic(dialog, filename);
        await expect(dialog.getByText(filename, { exact: true })).toBeVisible();
        if (!edit) {
          await fixture("music-refresh");
          await expect(
            page
              .locator("#main")
              .getByText("Entry Student A (refreshed)", { exact: true })
          ).toBeVisible();
          await expect(dialog).toBeVisible();
          await expect(
            dialog.getByText(filename, { exact: true })
          ).toBeVisible();
        }
        const staged = await fixture<State>("state");
        expect(staged.entries[0]?.musicFileName).toBe(
          edit ? "music-initial.mp3" : null
        );
        await entries.saveMusic(dialog);
        await expect
          .poll(
            async () =>
              (await fixture<State>("state")).entries[0]?.musicFileName
          )
          .toBe(filename);
        const committed = await fixture<State>("state");
        if (committed.entries[0]?.musicObjectKey)
          uploadedKeys.add(committed.entries[0].musicObjectKey);
        await entries.expectMusicDownloadOk(
          page.getByTestId("entry-music"),
          filename
        );
      }
      await fixture("music-mode", "reader");
      await entries.goto(data.year, "Group Dance");
      await expect(
        page.getByRole("button", { name: "Edit music", exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Upload music", exact: true })
      ).toHaveCount(0);
      const playback = await entries.openMusicPlayback(
        page.getByTestId("entry-music"),
        "music-replacement.mp3"
      );
      await entries.expectAudioPlaysAndSeeks(playback, "music-replacement.mp3");
      await fixture("playback-refresh");
      await expect(
        page
          .locator("#main")
          .getByText("Entry Student A (playback refresh)", { exact: true })
      ).toBeVisible();
      await expect(playback).toBeVisible();
      const audio = playback.getByLabel("Play music-replacement.mp3", {
        exact: true,
      });
      await expect
        .poll(() =>
          audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
        )
        .toBeGreaterThan(6);
      expect(
        await audio.evaluate(
          (element) => (element as HTMLAudioElement).error?.code ?? null
        )
      ).toBeNull();
      await playback
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await entries.expectMusicDownloadOk(
        page.getByTestId("entry-music"),
        "music-replacement.mp3"
      );
      await page.route(
        (url) =>
          url.pathname === "/api/attachments/download" &&
          url.searchParams.get("disposition") === "inline" &&
          url.searchParams.get("id") === data.entryId,
        (route) =>
          route.fulfill({
            status: 503,
            contentType: "text/plain",
            body: "Transient test audio failure",
          }),
        { times: 1 }
      );
      const failedPlayback = await entries.openMusicPlayback(
        page.getByTestId("entry-music"),
        "music-replacement.mp3"
      );
      await expect(failedPlayback.getByRole("alert")).toContainText(
        "Audio could not be played"
      );
      await failedPlayback
        .getByRole("button", { name: "Retry playback", exact: true })
        .click();
      await entries.expectAudioPlaysAndSeeks(
        failedPlayback,
        "music-replacement.mp3"
      );
      await failedPlayback
        .getByRole("button", { name: "Close", exact: true })
        .click();
      const denied = await mutate(
        page.request,
        "kalakritiEntry.removeMusic",
        command(data.entryId)
      );
      expect(denied.error).toBeDefined();
    } finally {
      // Capture any just-committed key even when a later assertion failed, then remove exactly these test objects rather than waiting for delayed jobs.
      const state = await fixture<State>("state");
      if (state.entries[0]?.musicObjectKey)
        uploadedKeys.add(state.entries[0].musicObjectKey);
      await fixture("music-mode", "writer");
      await mutate(
        page.request,
        "kalakritiEntry.removeMusic",
        command(data.entryId)
      );
      if (uploadedKeys.size)
        await fixture("music-cleanup-r2", JSON.stringify([...uploadedKeys]));
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });
});
