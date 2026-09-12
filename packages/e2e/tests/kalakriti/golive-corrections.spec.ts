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
import type { GoliveCorrectionFixtures } from "../../helpers/kalakriti-golive-corrections";
import { registrationCleanup } from "../../helpers/registration-cleanup";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-golive-corrections.ts"
);
async function fixture<T>(action: string, value?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, ...(value ? [value] : [])],
    { env: process.env, timeout: 60_000, killSignal: "SIGKILL" }
  );
  return JSON.parse(stdout.trim()) as T;
}
type Operation = {
  id: string;
  editionId: string;
  type: string;
  studentId: string | null;
  membershipId: string | null;
  competitionSessionId: string | null;
  occurredAt: string;
  operationId: string;
  recordedBy: string;
  correctionReason: string | null;
  supersededByOperationId: string | null;
};
type State = {
  domainAudit: Array<{
    action: string;
    targetType: string;
    targetId: string;
    domain: string;
    reason: string | null;
    metadata: Record<string, unknown>;
  }>;
  editions: Array<{ id: string; lifecycle: string }>;
  operations: Operation[];
  stages: Array<{
    centerId: string;
    stage: string;
    finalizedAt: string | null;
  }>;
};
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
async function publicQueryAst(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
) {
  const response = await request.post("/api/zero/query", {
    data: [
      "transform",
      [{ id: uuidv7(), name: `kalakritiOperation.${name}`, args: [args] }],
    ],
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.kind).toBe("QueryResponse");
  expect(result.queries[0].error).toBeUndefined();
  expect(result.queries[0].ast).toBeDefined();
  return JSON.stringify(result.queries[0].ast);
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
function record(
  editionId: string,
  studentId: string,
  type: Parameters<typeof mutators.kalakritiOperation.record>[0]["type"]
): Parameters<typeof mutators.kalakritiOperation.record>[0] {
  const now = Date.now();
  return {
    editionId,
    personQr: JSON.stringify({ id: studentId, type: "student" }),
    type,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}
function correction(
  editionId: string,
  targetOperationId: string,
  reason = "Fixture annotation; keep the scan effective"
): Parameters<typeof mutators.kalakritiOperation.correct>[0] {
  return {
    editionId,
    targetOperationId,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
    reason,
  };
}
function facts(operation: Operation) {
  return {
    editionId: operation.editionId,
    type: operation.type,
    studentId: operation.studentId,
    membershipId: operation.membershipId,
    competitionSessionId: operation.competitionSessionId,
    occurredAt: operation.occurredAt,
  };
}
function effective(operations: Operation[]) {
  return operations
    .filter((row) => row.supersededByOperationId === null)
    .map(facts)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
async function withFixture(
  browser: Browser,
  baseURL: string | undefined,
  adminEmail: string,
  testInfo: TestInfo,
  run: (
    data: GoliveCorrectionFixtures,
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
    const data = await fixture<GoliveCorrectionFixtures>("setup", adminEmail);
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
    "Serialized go-live/correction invariants"
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

test("correction scope follows the actual Competition and rejects meal-undo markers", async ({
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
    async ({ first }, admin, actor) => {
      expect(
        (
          await mutate(
            admin.request,
            "kalakritiEdition.transition",
            transition(first.editionId)
          )
        ).error
      ).toBeUndefined();
      const coordinator = await actor(
        kalakritiActors.volunteerCoordinator.storageState
      );
      const attendance = [];
      for (const [centerId, studentId, sessionId] of [
        [first.centerId, first.studentId, first.sessionId],
        [first.centerB, first.studentB, first.sessionB],
      ] as const) {
        expect(
          (
            await mutate(
              admin.request,
              "kalakritiOperation.record",
              record(first.editionId, studentId, "pickup")
            )
          ).error
        ).toBeUndefined();
        expect(
          (
            await mutate(admin.request, "kalakritiCenterScan.finalize", {
              editionId: first.editionId,
              centerId,
              expectedStage: "pickup",
              id: uuidv7(),
              auditEntryId: uuidv7(),
              now: Date.now(),
            })
          ).error
        ).toBeUndefined();
        expect(
          (
            await mutate(
              admin.request,
              "kalakritiOperation.record",
              record(first.editionId, studentId, "venue_arrival")
            )
          ).error
        ).toBeUndefined();
        const args = {
          ...record(first.editionId, studentId, "competition_attendance"),
          sessionId,
        };
        expect(
          (await mutate(admin.request, "kalakritiOperation.record", args)).error
        ).toBeUndefined();
        attendance.push(args);
      }
      const [inside, outside] = attendance;
      if (!inside || !outside) throw new Error("Missing fixture attendance");
      const before = await fixture<State>("state");
      for (const target of [outside.id, uuidv7()])
        expect(
          (
            await mutate(
              coordinator.request,
              "kalakritiOperation.correct",
              correction(first.editionId, target)
            )
          ).error
        ).toBeDefined();
      expect((await fixture<State>("state")).operations).toEqual(
        before.operations
      );
      const allowed = correction(
        first.editionId,
        inside.id,
        "Coordinator reviewed this exact Session"
      );
      expect(
        (
          await mutate(
            coordinator.request,
            "kalakritiOperation.correct",
            allowed
          )
        ).error
      ).toBeUndefined();
      const after = await fixture<State>("state");
      expect(effective(after.operations)).toEqual(effective(before.operations));
      expect(
        after.operations.find((row) => row.id === allowed.id)
          ?.competitionSessionId
      ).toBe(first.sessionId);
      const breakfast = record(first.editionId, first.studentId, "breakfast");
      expect(
        (await mutate(admin.request, "kalakritiOperation.record", breakfast))
          .error
      ).toBeUndefined();
      const undo = {
        editionId: first.editionId,
        targetOperationId: breakfast.id,
        id: uuidv7(),
        operationId: uuidv7(),
        auditEntryId: uuidv7(),
        now: Date.now(),
      };
      expect(
        (await mutate(admin.request, "kalakritiOperation.undoMeal", undo)).error
      ).toBeUndefined();
      const beforeMarker = await fixture<State>("state");
      expect(
        beforeMarker.operations.find((row) => row.id === undo.id)?.type
      ).toBe("meal_correction");
      expect(
        (
          await mutate(
            admin.request,
            "kalakritiOperation.correct",
            correction(first.editionId, undo.id)
          )
        ).error
      ).toBeDefined();
      expect((await fixture<State>("state")).operations).toEqual(
        beforeMarker.operations
      );
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

test("correction notes preserve scan facts, meals and stages through strict replay and concurrent revisions", async ({
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
    async ({ first }, admin, actor) => {
      expect(
        (
          await mutate(
            admin.request,
            "kalakritiEdition.transition",
            transition(first.editionId)
          )
        ).error
      ).toBeUndefined();
      const transport = await actor(kalakritiActors.liaison.storageState);
      const member = await actor(
        kalakritiActors.unrelatedVolunteer.storageState
      );
      const guardian = await actor(kalakritiActors.guardian.storageState);
      await guardian.clearCookies();
      const login = await guardian.request.post("/api/auth/sign-in/email", {
        data: { email: first.guardianEmail, password: first.guardianPassword },
      });
      expect(login.ok()).toBe(true);
      const pickup = record(first.editionId, first.studentId, "pickup");
      const breakfast = record(first.editionId, first.studentId, "breakfast");
      for (const args of [pickup, breakfast])
        expect(
          (await mutate(admin.request, "kalakritiOperation.record", args)).error
        ).toBeUndefined();
      const before = await fixture<State>("state");
      const originalAudit = await fixture<unknown[]>("audit", pickup.id);
      expect(
        (
          await mutate(
            guardian.request,
            "kalakritiOperation.correct",
            correction(first.editionId, pickup.id)
          )
        ).error
      ).toBeDefined();
      const original = before.operations.find((row) => row.id === pickup.id);
      expect(original).toBeDefined();
      if (!original) throw new Error("Missing original pickup");
      expect(
        (
          await mutate(
            member.request,
            "kalakritiOperation.correct",
            correction(first.editionId, pickup.id)
          )
        ).error
      ).toBeDefined();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            correction(first.editionId, breakfast.id)
          )
        ).error
      ).toBeDefined();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            correction(first.editionId, pickup.id, "   ")
          )
        ).error
      ).toBeDefined();
      expect((await fixture<State>("state")).operations).toEqual(
        before.operations
      );

      const page = await transport.newPage();
      const scan = new KalakritiScanPage(page);
      await scan.installDecoder();
      await scan.goto(first.year);
      await scan.open("Correction Center A");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                typeof (window as Window & { stationScan?: unknown })
                  .stationScan
            ),
          { timeout: 10_000 }
        )
        .toBe("function");
      await scan.dialog
        .getByRole("button", { name: "Add correction note", exact: true })
        .click();
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                typeof (window as Window & { stationScan?: unknown })
                  .stationScan
            ),
          { timeout: 10_000 }
        )
        .toBe("undefined");
      await expect(
        scan.dialog.getByRole("combobox", { name: "Center", exact: true })
      ).toHaveCount(0);
      await expect(
        scan.dialog.getByText(
          "The scan remains effective; this does not undo it."
        )
      ).toBeVisible();
      await scan.dialog
        .getByLabel(/^Yearly ID(?:\s*\*)?$/)
        .fill(first.studentHumanId);
      await scan.dialog
        .getByRole("button", { name: "Look up", exact: true })
        .click();
      await scan.dialog.getByRole("combobox", { name: /^Operation/ }).click();
      const pickupOption = page.getByRole("option", { name: /pick.*up/i });
      await expect(pickupOption).toHaveCount(1);
      await pickupOption.click();
      const note = "Reviewed pickup record; preserve its original facts";
      await scan.dialog.getByLabel(/^Reason(?:\s*\*)?$/).fill(note);
      await scan.dialog
        .getByRole("button", { name: "Add correction note", exact: true })
        .click();
      await expect(
        page.getByText("Correction note added", { exact: true })
      ).toBeVisible();
      const after = await fixture<State>("state");
      const revised = after.operations.find(
        (row) => row.correctionReason === note
      );
      expect(revised).toBeDefined();
      if (!revised) throw new Error("Missing correction revision");
      expect(after.operations.find((row) => row.id === pickup.id)).toEqual({
        ...original,
        supersededByOperationId: revised.id,
      });
      expect(facts(revised)).toEqual(facts(original));
      expect(effective(after.operations)).toEqual(effective(before.operations));
      expect(after.stages).toEqual(before.stages);
      await scan.dialog
        .getByRole("button", { name: "Back to scanning", exact: true })
        .click();
      await expect(
        scan.dialog.getByRole("combobox", { name: "Center", exact: true })
      ).toContainText("Correction Center A");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                typeof (window as Window & { stationScan?: unknown })
                  .stationScan
            ),
          { timeout: 10_000 }
        )
        .toBe("function");
      expect(after.domainAudit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "corrected",
            domain: "event_day_operation",
            targetType: "event_day_operation",
            targetId: pickup.id,
            reason: null,
            metadata: expect.objectContaining({
              correctionId: revised.id,
              type: "pickup",
            }),
          }),
        ])
      );
      const correctionAudit = (
        await Promise.all(
          [pickup.id, revised.id].map((target) =>
            fixture<
              Array<{ action: string; outcome: string; metadata: unknown }>
            >("audit", target)
          )
        )
      ).flat();
      expect(correctionAudit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "kalakritiOperation.correct",
            outcome: "success",
          }),
        ])
      );
      expect(JSON.stringify(correctionAudit)).not.toContain(note);
      expect(await fixture("audit", pickup.id)).toEqual(
        expect.arrayContaining(originalAudit)
      );
      const food = await admin.newPage();
      await food.goto(`/kalakriti/${first.year}/food`);
      await waitForZeroReady(food);
      const row = food.getByRole("row").filter({
        has: food.getByText("Correction Student A", { exact: true }),
      });
      await expect(row).toBeVisible();
      const breakfastIndex = await food
        .getByRole("columnheader", { name: "Breakfast" })
        .evaluate((node) => (node as HTMLTableCellElement).cellIndex);
      await expect(
        row
          .getByRole("cell")
          .nth(breakfastIndex)
          .getByRole("img", { name: "Served", exact: true })
      ).toBeVisible();

      const attempts = [
        correction(first.editionId, revised.id, "Concurrent note A"),
        correction(first.editionId, revised.id, "Concurrent note B"),
      ];
      const outcomes = await Promise.all(
        attempts.map((args) =>
          mutate(transport.request, "kalakritiOperation.correct", args)
        )
      );
      expect(
        outcomes.filter((result) => result.error === undefined)
      ).toHaveLength(1);
      const accepted =
        attempts[outcomes.findIndex((result) => result.error === undefined)];
      if (!accepted) throw new Error("No accepted concurrent correction");
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            accepted
          )
        ).error
      ).toBeUndefined();
      expect(
        (await mutate(admin.request, "kalakritiOperation.correct", accepted))
          .error
      ).toBeDefined();
      expect(
        (
          await mutate(transport.request, "kalakritiOperation.correct", {
            ...accepted,
            reason: "Changed replay",
          })
        ).error
      ).toBeDefined();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            correction(first.editionId, revised.id)
          )
        ).error
      ).toBeDefined();
      const beforeFinalize = await fixture<State>("state");
      const lastNote = correction(
        first.editionId,
        accepted.id,
        "Annotation concurrent with stage finalization"
      );
      const finish = {
        editionId: first.editionId,
        centerId: first.centerId,
        expectedStage: "pickup",
        id: uuidv7(),
        auditEntryId: uuidv7(),
        now: Date.now(),
      };
      const finalOutcomes = await Promise.all([
        mutate(transport.request, "kalakritiOperation.correct", lastNote),
        mutate(transport.request, "kalakritiCenterScan.finalize", finish),
      ]);
      for (const outcome of finalOutcomes)
        expect(outcome.error).toBeUndefined();
      const final = await fixture<State>("state");
      expect(effective(final.operations)).toEqual(effective(before.operations));
      expect(final.operations).toHaveLength(
        beforeFinalize.operations.length + 1
      );
      expect(
        final.stages.find(
          (stage) =>
            stage.centerId === first.centerId && stage.stage === "pickup"
        )?.finalizedAt
      ).toBeTruthy();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            accepted
          )
        ).error
      ).toBeUndefined();
      const foodLead = await actor(kalakritiActors.categoryLead.storageState);
      const guardianMeal = {
        ...record(first.editionId, first.studentId, "breakfast"),
        personQr: JSON.stringify({ id: first.guardianId, type: "guardian" }),
      };
      expect(
        (await mutate(admin.request, "kalakritiOperation.record", guardianMeal))
          .error
      ).toBeUndefined();
      const guardianNote = correction(
        first.editionId,
        guardianMeal.id,
        "Guardian meal annotation before archival"
      );
      expect(
        (
          await mutate(
            foodLead.request,
            "kalakritiOperation.correct",
            guardianNote
          )
        ).error
      ).toBeUndefined();
      const beforeArchive = await fixture<State>("state");
      await fixture("archive-first");
      // Assert authenticated server query predicates, not client cache contents.
      for (const [name, args] of [
        [
          "bySubject",
          { editionId: first.editionId, membershipId: first.guardianId },
        ],
        [
          "membershipByHumanId",
          { editionId: first.editionId, humanId: first.guardianHumanId },
        ],
        [
          "studentByHumanId",
          { editionId: first.editionId, humanId: first.studentHumanId },
        ],
      ] as const) {
        expect(await publicQueryAst(foodLead.request, name, args)).toContain(
          '"archived"'
        );
        expect(await publicQueryAst(admin.request, name, args)).not.toContain(
          '"archived"'
        );
      }
      expect(
        (
          await mutate(
            foodLead.request,
            "kalakritiOperation.correct",
            guardianNote
          )
        ).error
      ).toBeUndefined();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            accepted
          )
        ).error
      ).toBeUndefined();
      expect(
        (
          await mutate(
            transport.request,
            "kalakritiOperation.correct",
            correction(first.editionId, lastNote.id)
          )
        ).error
      ).toBeDefined();
      expect((await fixture<State>("state")).operations).toEqual(
        beforeArchive.operations
      );
    }
  );
});
