// @e2e-areas teams users
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { request as playwrightRequest, type Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const PUBLICATION_COLUMNS_HELPER_PATH = path.resolve(
  import.meta.dirname,
  "../../helpers/publication-columns.ts"
);

const ZERO_AUTH_PROTECTED_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const ZERO_AUTH_LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000202";
const ZERO_AUTH_LEAD_TEAM_ID = "e2e00000-0000-0000-0000-000000000102";
const ZERO_AUTH_PROTECTED_INTEREST_ID = "e2e00000-0000-0000-0000-000000000301";
const ZERO_AUTH_PROTECTED_UPDATE_ID = "e2e00000-0000-0000-0000-000000000302";
const ZERO_AUTH_PROTECTED_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const ZERO_AUTH_LEAD_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000304";
const ZERO_AUTH_PROTECTED_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000306";

type QueryName =
  | "eventFeedback.byEvent"
  | "eventInterest.managerByEvent"
  | "eventInterest.myByEvent"
  | "eventPhoto.pendingByEvent"
  | "eventUpdate.pendingByEvent"
  | "scheduledMessage.byId";

function buildQueryBody(queryName: QueryName, args: Record<string, unknown>) {
  const suffix = `${queryName.replace(".", "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return [
    "transform",
    [
      {
        args: [args],
        id: `e2e-zero-query-${suffix}`,
        name: queryName,
      },
    ],
  ] as const;
}

async function getTransformedAstText(
  page: Page,
  baseURL: string | undefined,
  queryName: QueryName,
  args: Record<string, unknown>
): Promise<string> {
  expect(baseURL).toBeTruthy();
  const response = await page.request.post(`${baseURL}/api/zero/query`, {
    data: buildQueryBody(queryName, args),
  });
  expect(response.ok()).toBe(true);

  const json = await response.json();
  expect(json.kind).toBe("QueryResponse");
  expect(json.userID).toBeTruthy();
  expect(json.queries).toHaveLength(1);
  expect(json.queries[0].name).toBe(queryName);
  expect(json.queries[0].error).toBeUndefined();
  expect(json.queries[0].ast).toBeDefined();

  return JSON.stringify(json.queries[0].ast);
}

function expectLeadScopedAst(
  astText: string,
  eventId: string,
  protectedFixtureId: string
) {
  expect(astText).toContain(eventId);
  expect(astText).toContain("team_member");
  expect(astText).toContain("lead");
  expect(astText).not.toContain("__never_match__");
  expect(astText).not.toContain(protectedFixtureId);
}

function expectGloballyScopedAst(
  astText: string,
  eventId: string,
  protectedFixtureId: string
) {
  expect(astText).toContain(eventId);
  expect(astText).not.toContain("team_member");
  expect(astText).not.toContain("__never_match__");
  expect(astText).not.toContain(protectedFixtureId);
}

const PRIVATE_USER_COLUMNS = [
  "banExpires",
  "banned",
  "banReason",
  "createdAt",
  "dob",
  "email",
  "emailVerified",
  "gender",
  "isActive",
  "isOnWhatsapp",
  "partyId",
  "phone",
  "registrationGroup",
  "updatedAt",
] as const;
const PUBLIC_USER_COLUMNS = ["id", "image", "name", "role"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectUserRows(
  parts: unknown,
  rows: Record<string, unknown>[]
): void {
  if (!Array.isArray(parts)) {
    return;
  }
  for (const part of parts) {
    if (!(isRecord(part) && Array.isArray(part.rowsPatch))) {
      continue;
    }
    for (const patch of part.rowsPatch) {
      if (
        isRecord(patch) &&
        patch.op === "put" &&
        patch.tableName === "user" &&
        isRecord(patch.value)
      ) {
        rows.push(patch.value);
      }
    }
  }
}

function watchSyncedUserRows(page: Page) {
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  page.on("websocket", (socket) => {
    let pokeChunks: string[] = [];

    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") {
        pokeChunks.push(payload.subarray(1).toString("utf8"));
        return;
      }

      let message: unknown;
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      if (!Array.isArray(message)) {
        return;
      }

      if (message[0] === "pokeStart") {
        pokeChunks = [];
      } else if (message[0] === "pokePart") {
        collectUserRows([message[1]], rows);
      } else if (message[0] === "pokeEnd" && pokeChunks.length > 0) {
        try {
          collectUserRows(JSON.parse(pokeChunks.join("")), rows);
        } catch (error) {
          errors.push(String(error));
        }
        pokeChunks = [];
      }
    });
  });

  return { errors, rows };
}

test.describe("Zero public user projection", () => {
  test("publishes only the public user columns", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only");

    const { stdout } = await execFileAsync(
      "bun",
      ["run", PUBLICATION_COLUMNS_HELPER_PATH],
      { env: process.env }
    );
    const columns = JSON.parse(stdout.trim()) as string[];

    expect(columns.sort()).toEqual(["id", "image", "name", "role"].sort());
  });

  test("sends only public user columns over the Zero websocket", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "volunteer"].includes(testInfo.project.name),
      "An admin and a volunteer cover the projection"
    );
    const capture = watchSyncedUserRows(page);
    await page.goto("/");
    await waitForZeroReady(page);

    await expect.poll(() => capture.rows.length).toBeGreaterThan(0);
    expect(capture.errors).toEqual([]);
    for (const row of capture.rows) {
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("name");
      expect(
        Object.keys(row).every((key) =>
          PUBLIC_USER_COLUMNS.includes(
            key as (typeof PUBLIC_USER_COLUMNS)[number]
          )
        )
      ).toBe(true);
      for (const column of PRIVATE_USER_COLUMNS) {
        expect(row).not.toHaveProperty(column);
      }
    }
  });
});

test.describe("private user reads", () => {
  test("a volunteer can load their own private hover details", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto(`/teams/${ZERO_AUTH_LEAD_TEAM_ID}`);
    const self = page.getByLabel("View Test Volunteer's profile").first();
    await expect(self).toBeVisible({ timeout: 15_000 });
    await self.hover();
    await expect(page.getByText(volunteerEmail)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin endpoint returns private users and rejects a volunteer replay", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only");

    let adminUsersRequest: null | {
      headers: Record<string, string>;
      url: string;
    } = null;
    page.on("response", async (response) => {
      if (!response.url().includes("/_serverFn/")) {
        return;
      }
      const body = await response.text().catch(() => "");
      if (body.includes(volunteerEmail)) {
        const headers = await response.request().allHeaders();
        delete headers.cookie;
        adminUsersRequest = { headers, url: response.url() };
      }
    });

    await page.goto("/users");
    await page.getByPlaceholder("Search users...").fill(volunteerEmail);
    await expect(page.getByText(volunteerEmail)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => adminUsersRequest).not.toBeNull();

    const volunteer = await playwrightRequest.newContext({
      baseURL: testInfo.project.use.baseURL as string,
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/volunteer.json"
      ),
    });
    try {
      const replay = await volunteer.get(adminUsersRequest!.url, {
        headers: adminUsersRequest!.headers,
      });
      const body = await replay.text();
      expect(body).toContain("Forbidden");
      expect(body).not.toContain(volunteerEmail);
    } finally {
      await volunteer.dispose();
    }
  });
});

test.describe("Zero query API authorization — volunteer", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("scheduled message details require scheduling permission", async ({
    baseURL,
    page,
  }) => {
    const ast = await getTransformedAstText(
      page,
      baseURL,
      "scheduledMessage.byId",
      { id: "e2e00000-0000-4000-8000-000000000401" }
    );
    expect(ast).toContain("__never_match__");
  });

  test("protected manager queries are transformed with team-lead gates", async ({
    baseURL,
    page,
  }) => {
    expectLeadScopedAst(
      await getTransformedAstText(
        page,
        baseURL,
        "eventInterest.managerByEvent",
        { eventId: ZERO_AUTH_PROTECTED_EVENT_ID }
      ),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_INTEREST_ID
    );

    expectLeadScopedAst(
      await getTransformedAstText(page, baseURL, "eventUpdate.pendingByEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_UPDATE_ID
    );

    expectLeadScopedAst(
      await getTransformedAstText(page, baseURL, "eventPhoto.pendingByEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_PHOTO_ID
    );

    expectLeadScopedAst(
      await getTransformedAstText(page, baseURL, "eventFeedback.byEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_FEEDBACK_ID
    );
  });

  test("own interest and lead feedback queries remain available", async ({
    baseURL,
    page,
  }) => {
    const myInterestAst = await getTransformedAstText(
      page,
      baseURL,
      "eventInterest.myByEvent",
      { eventId: ZERO_AUTH_PROTECTED_EVENT_ID }
    );
    expect(myInterestAst).toContain(ZERO_AUTH_PROTECTED_EVENT_ID);
    expect(myInterestAst).toContain("user_id");
    expect(myInterestAst).toContain("team_member");
    expect(myInterestAst).not.toContain("__never_match__");
    expect(myInterestAst).not.toContain(ZERO_AUTH_PROTECTED_INTEREST_ID);

    expectLeadScopedAst(
      await getTransformedAstText(page, baseURL, "eventFeedback.byEvent", {
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
      }),
      ZERO_AUTH_LEAD_EVENT_ID,
      ZERO_AUTH_LEAD_FEEDBACK_ID
    );
  });
});

test.describe("Zero query API authorization — global manager", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only test");
  });

  test("scheduled message details remain available to schedulers", async ({
    baseURL,
    page,
  }) => {
    const id = "e2e00000-0000-4000-8000-000000000401";
    const ast = await getTransformedAstText(
      page,
      baseURL,
      "scheduledMessage.byId",
      { id }
    );
    expect(ast).toContain(id);
    expect(ast).not.toContain("__never_match__");
  });

  test("global manager queries are transformed without lead-only gates", async ({
    baseURL,
    page,
  }) => {
    expectGloballyScopedAst(
      await getTransformedAstText(
        page,
        baseURL,
        "eventInterest.managerByEvent",
        { eventId: ZERO_AUTH_PROTECTED_EVENT_ID }
      ),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_INTEREST_ID
    );

    expectGloballyScopedAst(
      await getTransformedAstText(page, baseURL, "eventUpdate.pendingByEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_UPDATE_ID
    );

    expectGloballyScopedAst(
      await getTransformedAstText(page, baseURL, "eventPhoto.pendingByEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_PHOTO_ID
    );

    expectGloballyScopedAst(
      await getTransformedAstText(page, baseURL, "eventFeedback.byEvent", {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      }),
      ZERO_AUTH_PROTECTED_EVENT_ID,
      ZERO_AUTH_PROTECTED_FEEDBACK_ID
    );

    expectGloballyScopedAst(
      await getTransformedAstText(page, baseURL, "eventFeedback.byEvent", {
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
      }),
      ZERO_AUTH_LEAD_EVENT_ID,
      ZERO_AUTH_LEAD_FEEDBACK_ID
    );
  });
});
