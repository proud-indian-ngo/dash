import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  TestInfo,
} from "@playwright/test";
import { uuidv7 } from "uuidv7";

import type { mutators } from "../../../zero/src/mutators";
import { expect, test, waitForZeroReady } from "../../fixtures/test";
import type { GoliveFixtures } from "../../helpers/kalakriti-golive";
import { registrationCleanup } from "../../helpers/registration-cleanup";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-golive.ts"
);
async function fixture<T>(action: string, value?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, ...(value ? [value] : [])],
    { env: process.env, timeout: 60_000, killSignal: "SIGKILL" }
  );
  return JSON.parse(stdout.trim()) as T;
}
type State = { editions: Array<{ id: string; lifecycle: string }> };
async function mutate(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
) {
  const clientId = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `golive-${clientId}`,
        requestID: clientId,
        pushVersion: 1,
        timestamp: Date.now(),
        mutations: [
          {
            args: [args],
            clientID: clientId,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
      },
    }
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return body.mutations[0].result as { error?: unknown };
}
function transition(
  editionId: string
): Parameters<typeof mutators.kalakritiEdition.transition>[0] {
  return {
    editionId,
    targetLifecycle: "live",
    confirmed: true,
    auditEntryId: uuidv7(),
    now: Date.now(),
  };
}
async function withFixture(
  browser: Browser,
  baseURL: string | undefined,
  adminEmail: string,
  testInfo: TestInfo,
  run: (
    data: GoliveFixtures,
    admin: BrowserContext,
    actor: (storageState: string | undefined) => Promise<BrowserContext>
  ) => Promise<void>
) {
  const contexts: BrowserContext[] = [];
  let failed = true;
  const actor = async (storageState: string | undefined) => {
    if (!storageState) throw new Error("Missing actor authentication state");
    const context = await browser.newContext({ baseURL, storageState });
    contexts.push(context);
    return context;
  };
  try {
    const data = await fixture<GoliveFixtures>("setup", adminEmail);
    const admin = await actor(
      path.resolve(import.meta.dirname, "../../.auth/super_admin.json")
    );
    await run(data, admin, actor);
    failed = false;
  } finally {
    await registrationCleanup(
      [
        ...contexts.flatMap((context, contextIndex) =>
          context.pages().map((page, pageIndex) => async () => {
            if (failed && !page.isClosed())
              await testInfo.attach(
                `failure-context-${contextIndex}-page-${pageIndex}`,
                {
                  body: await page.locator("body").ariaSnapshot(),
                  contentType: "text/plain",
                }
              );
          })
        ),
        ...contexts.map((context) => () => context.close()),
        () => fixture("cleanup"),
      ],
      failed,
      testInfo
    );
  }
}

test.beforeEach(({ baseURL }, testInfo) => {
  expect(baseURL).toBeDefined();
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Serialized go-live invariants"
  );
  test.slow();
});

test("go-live enforces readiness and authorization without Credential issuance, then rejects another LIVE Edition", async ({
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  await withFixture(
    browser,
    baseURL,
    superAdminEmail,
    testInfo,
    async ({ first, second }, admin, actor) => {
      const page = await admin.newPage();
      const member = await actor(
        kalakritiActors.unrelatedVolunteer.storageState
      );
      await fixture("block-center");
      await page.goto(`/kalakriti/${first.year}`);
      await waitForZeroReady(page);
      await expect(
        page.getByText(
          "Every active Center must have registration controls disabled",
          { exact: true }
        )
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Go live", exact: true })
      ).toBeDisabled();
      expect(
        (
          await mutate(
            admin.request,
            "kalakritiEdition.transition",
            transition(first.editionId)
          )
        ).error
      ).toBeDefined();
      await fixture("ready-centers");
      expect(
        (
          await mutate(
            member.request,
            "kalakritiEdition.transition",
            transition(first.editionId)
          )
        ).error
      ).toBeDefined();
      await expect(
        page.getByRole("button", { name: "Go live", exact: true })
      ).toBeEnabled();
      await page.getByRole("button", { name: "Go live", exact: true }).click();
      const confirm = page.getByRole("alertdialog", {
        name: "Go live?",
        exact: true,
      });
      await confirm
        .getByRole("button", { name: "Go live", exact: true })
        .click();
      await expect(confirm).toBeHidden();
      await expect
        .poll(
          async () =>
            (await fixture<State>("state")).editions.find(
              (row) => row.id === first.editionId
            )?.lifecycle
        )
        .toBe("live");
      expect(
        (
          await mutate(
            admin.request,
            "kalakritiEdition.transition",
            transition(second.editionId)
          )
        ).error
      ).toBeDefined();
      const state = await fixture<State>("state");
      expect(
        state.editions.filter((row) => row.lifecycle === "live")
      ).toHaveLength(1);
      expect(
        state.editions.find((row) => row.id === second.editionId)?.lifecycle
      ).toBe("registration_locked");
    }
  );
});

test("concurrent go-live commands across two ready Editions commit exactly one LIVE Edition", async ({
  browser,
  baseURL,
  superAdminEmail,
}, testInfo) => {
  await withFixture(
    browser,
    baseURL,
    superAdminEmail,
    testInfo,
    async ({ first, second }, admin) => {
      const outcomes = await Promise.all(
        [first, second].map((f) =>
          mutate(
            admin.request,
            "kalakritiEdition.transition",
            transition(f.editionId)
          )
        )
      );
      expect(
        outcomes.filter((result) => result.error === undefined)
      ).toHaveLength(1);
      expect(
        outcomes.filter((result) => result.error !== undefined)
      ).toHaveLength(1);
      const state = await fixture<State>("state");
      expect(
        state.editions.filter((row) => row.lifecycle === "live")
      ).toHaveLength(1);
      expect(
        state.editions.filter((row) => row.lifecycle === "registration_locked")
      ).toHaveLength(1);
    }
  );
});
