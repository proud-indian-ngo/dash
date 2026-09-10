import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Request } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
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
  individualDivisionId: string;
  studentIds: string[];
}
interface State {
  entries: { id: string }[];
  musicFiles: {
    id: string;
    entryId: string;
    fileName: string;
    objectKey: string;
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

  test("music is optional for individual creation and a three-file creation is rejected atomically", async ({
    page,
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>("setup", volunteerEmail);
    try {
      for (const music of [undefined, []]) {
        const result = await mutate(
          page.request,
          "kalakritiEntry.createIndividual",
          {
            ...command(uuidv7()),
            editionId: data.editionId,
            centerId: data.centerId,
            divisionId: data.individualDivisionId,
            memberId: uuidv7(),
            studentId: data.studentIds[music ? 1 : 0],
            ...(music ? { music } : {}),
          }
        );
        expect(result.error).toBeUndefined();
      }
      const before = await fixture<State>("state");
      expect(before.entries).toHaveLength(3);
      expect(before.musicFiles).toEqual([]);
      const rejected = await mutate(
        page.request,
        "kalakritiEntry.createIndividual",
        {
          ...command(uuidv7()),
          editionId: data.editionId,
          centerId: data.centerId,
          divisionId: data.individualDivisionId,
          memberId: uuidv7(),
          studentId: data.studentIds[2],
          music: [0, 1, 2].map(() => ({
            id: uuidv7(),
            byteSize: 78,
            fileName: "music-cap.mp3",
            mimeType: "audio/mpeg",
            objectKey: "unclaimed",
          })),
        }
      );
      expect(rejected.error).toBeDefined();
      const after = await fixture<State>("state");
      expect(after).toEqual(before);
    } finally {
      await fixture("cleanup");
    }
  });

  test("legacy backfill preserves object identity and metadata, rejects malformed rows, and is idempotent in PostgreSQL", async ({
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>("setup", volunteerEmail);
    try {
      type BackfillResult = {
        candidates: number;
        updated: number;
        malformedIds: string[];
      };
      const result = await fixture<{
        legacy: {
          musicObjectKey: string;
          musicFileName: string;
          musicMimeType: string;
          musicByteSize: number;
          musicUploadedAt: string;
          musicUploadedBy: string;
        };
        malformed: BackfillResult;
        malformedState: State;
        dryRun: BackfillResult;
        dryRunState: State;
        applied: BackfillResult;
        appliedState: State;
        repeated: BackfillResult;
        repeatedState: State;
        cleared: Record<string, unknown>;
      }>("music-backfill");
      expect(result.malformed.malformedIds).toContain(data.entryId);
      expect(result.malformedState.musicFiles).toEqual([]);
      expect(result.dryRun.candidates).toBeGreaterThanOrEqual(1);
      expect(result.dryRun.updated).toBe(0);
      expect(result.dryRunState.musicFiles).toEqual([]);
      expect(result.applied.updated).toBeGreaterThanOrEqual(1);
      expect(result.appliedState.musicFiles).toEqual([
        expect.objectContaining({
          id: data.entryId,
          entryId: data.entryId,
          editionId: data.editionId,
          slot: 1,
          objectKey: result.legacy.musicObjectKey,
          fileName: result.legacy.musicFileName,
          mimeType: result.legacy.musicMimeType,
          byteSize: result.legacy.musicByteSize,
          uploadedAt: result.legacy.musicUploadedAt,
          uploadedBy: result.legacy.musicUploadedBy,
        }),
      ]);
      for (const key of Object.keys(result.legacy))
        expect(result.cleared[key]).toBeNull();
      expect(result.repeated.updated).toBe(0);
      expect(result.repeatedState).toEqual(result.appliedState);
    } finally {
      await fixture("cleanup");
    }
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
        // A no-op music update passes the closed-registration gate without an R2 write.
        const music = await mutate(page.request, "kalakritiEntry.updateMusic", {
          ...command(data.entryId),
          music: [],
          removeMusicFileIds: [],
        });
        expect(music.error).toBeUndefined();
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
          "kalakritiEntry.updateMusic",
          {
            ...command(data.entryId),
            music: [
              {
                id: uuidv7(),
                byteSize: 78,
                fileName: "denied.mp3",
                mimeType: "audio/mpeg",
                objectKey: "invalid-unclaimed-object",
              },
            ],
            removeMusicFileIds: [],
          }
        );
        expect(result.error).toBeDefined();
        expect(result.message).toMatch(
          /music upload|archived|Unauthorized|Forbidden/i
        );
      }
      const state = await fixture<State>("state");
      expect(state.musicFiles).toEqual([]);
      expect(state.members.map((member) => member.studentId).sort()).toEqual(
        data.studentIds.slice(0, 2).sort()
      );
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("two optional files survive partial retry, Cancel discards staging, and concurrent independent additions cannot exceed two", async ({
    page,
    volunteerEmail,
    browser,
    baseURL,
  }) => {
    test.skip(
      Boolean(process.env.CI),
      "Requires real R2 promotion as well as the real E2E PostgreSQL transaction boundary"
    );
    test.setTimeout(240_000);
    const data = await fixture<Fixture>("setup", volunteerEmail);
    const entries = new KalakritiEntriesPage(page);
    const uploadedKeys = entries.trackMusicUploadKeys();
    // Separate IndexedDB stores force independent Zero clients, not shared-tab leadership.
    const secondContext = await browser.newContext({
      baseURL,
      storageState: await page.context().storageState(),
    });
    const secondPage = await secondContext.newPage();
    const secondEntries = new KalakritiEntriesPage(secondPage);
    const secondKeys = secondEntries.trackMusicUploadKeys();
    try {
      await fixture("music-mode", "edition-closed");
      await entries.goto(data.year, "Group Dance");
      let dialog = await entries.openMusicDialog();
      let failures = 0;
      let successfulFilePuts = 0;
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (
          request.method() === "PUT" &&
          decodeURIComponent(request.url()).includes("music-retry.mp3") &&
          failures++ === 0
        ) {
          await route.abort();
          return;
        }
        if (
          request.method() === "PUT" &&
          decodeURIComponent(request.url()).includes("music-initial.mp3")
        )
          successfulFilePuts++;
        await route.continue();
      });
      await entries.attachMusicFiles(dialog, [
        "music-initial.mp3",
        "music-retry.mp3",
      ]);
      await expect(
        dialog.getByRole("button", {
          name: "Retry music-retry.mp3",
          exact: true,
        })
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Save music", exact: true })
      ).toBeDisabled();
      await dialog
        .getByRole("button", { name: "Retry music-retry.mp3", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Save music", exact: true })
      ).toBeEnabled();
      expect(successfulFilePuts).toBe(1);
      expect((await fixture<State>("state")).musicFiles).toEqual([]);
      const canceledKeys = [...uploadedKeys];
      expect(canceledKeys.length).toBeGreaterThanOrEqual(2);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () =>
          (
            await fixture<{ exists: boolean }[]>(
              "music-r2-state",
              JSON.stringify(canceledKeys)
            )
          ).some((file) => file.exists)
        )
        .toBe(false);
      expect((await fixture<State>("state")).musicFiles).toEqual([]);

      dialog = await entries.openMusicDialog();
      await entries.attachMusicFiles(dialog, [
        "music-initial.mp3",
        "music-second.mp3",
      ]);
      await expect(
        dialog.getByRole("button", { name: "Save music", exact: true })
      ).toBeEnabled();
      await expect(
        dialog.getByRole("button", { name: "Upload audio", exact: true })
      ).toBeDisabled();
      await entries.saveMusic(dialog);
      await expect
        .poll(async () => (await fixture<State>("state")).musicFiles.length)
        .toBe(2);
      const saved = await fixture<State>("state");
      for (const file of saved.musicFiles) uploadedKeys.add(file.objectKey);
      for (const file of saved.musicFiles)
        await entries.expectMusicDownloadOk(
          page.getByTestId("entry-music"),
          file.fileName
        );
      const exported = await page.request.get(
        `/api/kalakriti/${data.year}/registration-export`
      );
      expect(exported.status()).toBe(200);
      const exportText = Object.values(
        unzipSync(new Uint8Array(await exported.body()))
      )
        .map((bytes) => strFromU8(bytes))
        .join("\n");
      const publicResponse = await page.request.get(
        `/api/kalakriti/${data.year}/schedule`,
        { headers: { Cookie: "" } }
      );
      expect(publicResponse.status()).toBe(200);
      const publicText = await publicResponse.text();
      for (const file of saved.musicFiles) {
        for (const value of [file.id, file.objectKey, file.fileName]) {
          expect(exportText).not.toContain(value);
          expect(publicText).not.toContain(value);
        }
      }
      expect(publicText).not.toMatch(/musicFiles|musicUploadEnabled|objectKey/);
      dialog = await entries.openMusicDialog(true);
      await dialog
        .getByRole("button", { name: "Remove music-second.mp3", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect((await fixture<State>("state")).musicFiles).toEqual(
        saved.musicFiles
      );
      dialog = await entries.openMusicDialog(true);
      await dialog
        .getByRole("button", { name: "Remove music-second.mp3", exact: true })
        .click();
      await entries.saveMusic(dialog);
      await expect
        .poll(async () => (await fixture<State>("state")).musicFiles.length)
        .toBe(1);
      const removed = saved.musicFiles.find(
        (file) => file.fileName === "music-second.mp3"
      )!;
      expect(
        (
          await page.request.get(
            `/api/attachments/download?kind=kalakritiEntryMusic&id=${removed.id}`
          )
        ).status()
      ).toBe(404);

      await secondEntries.goto(data.year, "Group Dance");
      const [firstDialog, secondDialog] = await Promise.all([
        entries.openMusicDialog(true),
        secondEntries.openMusicDialog(true),
      ]);
      await Promise.all([
        entries.attachMusic(firstDialog, "music-race-first.mp3"),
        secondEntries.attachMusic(secondDialog, "music-race-second.mp3"),
      ]);
      await expect(
        firstDialog.getByRole("button", { name: "Save music", exact: true })
      ).toBeEnabled();
      await expect(
        secondDialog.getByRole("button", { name: "Save music", exact: true })
      ).toBeEnabled();
      // Submit independent additions directly through the authenticated mutation
      // endpoint so live UI cap updates cannot prevent the second server attempt.
      const byteSize = statSync(
        path.resolve(import.meta.dirname, "../../fixtures/audio/track.mp3")
      ).size;
      const additions = [
        {
          request: page.request,
          keys: uploadedKeys,
          fileName: "music-race-first.mp3",
        },
        {
          request: secondPage.request,
          keys: secondKeys,
          fileName: "music-race-second.mp3",
        },
      ].map(({ request, keys, fileName }) => {
        const objectKey = [...keys].find((key) => key.endsWith(`-${fileName}`));
        expect(objectKey).toBeDefined();
        return {
          request,
          music: [
            {
              id: uuidv7(),
              byteSize,
              fileName,
              mimeType: "audio/mpeg",
              objectKey,
            },
          ],
        };
      });
      const outcomes = await Promise.all(
        additions.map(({ request, music }) =>
          mutate(request, "kalakritiEntry.updateMusic", {
            ...command(data.entryId),
            music,
            removeMusicFileIds: [],
          })
        )
      );
      expect(outcomes.filter((result) => !result.error)).toHaveLength(1);
      expect(outcomes.find((result) => result.error)?.message).toContain(
        "at most two music files"
      );
      const raced = await fixture<State>("state");
      expect(raced.musicFiles).toHaveLength(2);
      expect(
        raced.musicFiles.filter((file) =>
          file.fileName.startsWith("music-race-")
        )
      ).toHaveLength(1);
      expect(
        raced.musicFiles.some((file) => file.fileName === "music-initial.mp3")
      ).toBe(true);
      for (const modal of [firstDialog, secondDialog])
        if (await modal.isVisible())
          await modal
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
      await fixture("music-mode", "unauthorized");
      for (const file of raced.musicFiles)
        expect(
          (
            await page.request.get(
              `/api/attachments/download?kind=kalakritiEntryMusic&id=${file.id}`
            )
          ).status()
        ).toBe(403);
      await fixture("music-mode", "writer");
      await fixture("music-mode", "disabled");
      for (const file of raced.musicFiles) {
        uploadedKeys.add(file.objectKey);
        expect(
          (
            await page.request.get(
              `/api/attachments/download?kind=kalakritiEntryMusic&id=${file.id}`
            )
          ).status()
        ).toBe(200);
      }
      const removedWhileDisabled = await mutate(
        page.request,
        "kalakritiEntry.updateMusic",
        {
          ...command(data.entryId),
          music: [],
          removeMusicFileIds: raced.musicFiles.map((file) => file.id),
        }
      );
      expect(removedWhileDisabled.error).toBeUndefined();
      expect((await fixture<State>("state")).musicFiles).toEqual([]);
      for (const file of raced.musicFiles)
        expect(
          (
            await page.request.get(
              `/api/attachments/download?kind=kalakritiEntryMusic&id=${file.id}`
            )
          ).status()
        ).toBe(404);
    } finally {
      const state = await fixture<State>("state");
      for (const file of state.musicFiles) uploadedKeys.add(file.objectKey);
      for (const key of secondKeys) uploadedKeys.add(key);
      await secondContext.close();
      await page.goto("about:blank");
      if (uploadedKeys.size)
        await fixture("music-cleanup-r2", JSON.stringify([...uploadedKeys]));
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
        if (edit)
          await dialog
            .getByRole("button", {
              name: "Remove music-initial.mp3",
              exact: true,
            })
            .click();
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
        expect(staged.musicFiles.map((file) => file.fileName)).toEqual(
          edit ? ["music-initial.mp3"] : []
        );
        await entries.saveMusic(dialog);
        await expect
          .poll(
            async () => (await fixture<State>("state")).musicFiles[0]?.fileName
          )
          .toBe(filename);
        const committed = await fixture<State>("state");
        for (const file of committed.musicFiles)
          uploadedKeys.add(file.objectKey);
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
          url.searchParams.get("kind") === "kalakritiEntryMusic",
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
      const denied = await mutate(page.request, "kalakritiEntry.updateMusic", {
        ...command(data.entryId),
        music: [],
        removeMusicFileIds: (await fixture<State>("state")).musicFiles.map(
          (file) => file.id
        ),
      });
      expect(denied.error).toBeDefined();
    } finally {
      // Capture any just-committed key even when a later assertion failed, then remove exactly these test objects rather than waiting for delayed jobs.
      const state = await fixture<State>("state");
      for (const file of state.musicFiles) uploadedKeys.add(file.objectKey);
      await fixture("music-mode", "writer");
      await mutate(page.request, "kalakritiEntry.updateMusic", {
        ...command(data.entryId),
        music: [],
        removeMusicFileIds: (await fixture<State>("state")).musicFiles.map(
          (file) => file.id
        ),
      });
      if (uploadedKeys.size)
        await fixture("music-cleanup-r2", JSON.stringify([...uploadedKeys]));
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });
});
