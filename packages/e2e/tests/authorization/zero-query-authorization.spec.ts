import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures/test";

const ZERO_AUTH_PROTECTED_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const ZERO_AUTH_LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000202";
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
  | "eventUpdate.pendingByEvent";

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

test.describe("Zero query API authorization — volunteer", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
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
    expect(myInterestAst).not.toContain("team_member");
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
