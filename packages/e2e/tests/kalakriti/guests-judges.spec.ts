import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiAttendeePage } from "../../pages/kalakriti-attendee-page";
import { KalakritiPersonQrPage } from "../../pages/kalakriti-person-qr-page";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";

const execFileAsync = promisify(execFile);
test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});

interface Setup {
  year: number;
  editionId: string;
  foreignEditionId: string;
}
interface Attendee {
  id: string;
  name: string;
  humanId: string;
  kind: "guest" | "judge";
  email: string | null;
  archivedAt: string | null;
}
interface State {
  attendees: Attendee[];
  assignments: { attendeeId: string; competitionId: string }[];
  operations: {
    id: string;
    attendeeId: string | null;
    type: string;
    supersededByOperationId: string | null;
  }[];
  accounts: { id: string }[];
}
async function fixture<T>(
  helper: "station" | "attendee",
  action: string,
  ...args: string[]
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        helper === "attendee"
          ? "../../helpers/kalakriti-attendee-subject.ts"
          : "../../helpers/kalakriti-station-subject.ts"
      ),
      action,
      ...args,
    ],
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
        clientGroupID: `attendee-${id}`,
        requestID: id,
        pushVersion: 1,
        timestamp: Date.now(),
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
      },
    }
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.mutations).toHaveLength(1);
  return body.mutations[0].result as { error?: string; message?: string };
}
function command(editionId: string) {
  const now = Date.now();
  return {
    id: uuidv7(),
    editionId,
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}

test("non-login guests and judges support multiple competitions, scoped visibility, check-in and meals", async ({
  page,
  request,
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Live Edition requires serialized invariant lane"
  );
  test.slow();
  const data = await fixture<Setup>("station", "setup", superAdminEmail);
  const readState = () => fixture<State>("attendee", "state", data.editionId);
  const coordinator = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.volunteerCoordinator.storageState,
  });
  const events = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.overallEventsLead.storageState,
  });
  try {
    const competitions = await fixture<{ id: string; name: string }[]>(
      "attendee",
      "prepare",
      data.editionId
    );
    expect(competitions).toHaveLength(2);
    const roster = new KalakritiAttendeePage(page);
    await roster.goto(data.year, "Guest");
    await roster.create("Guest", "E2E Invited Guest", "9876543210");
    await roster.verifyTableControls("Guest", "E2E Invited Guest");
    await roster.goto(data.year, "Judge");
    await roster.create(
      "Judge",
      "E2E Invited Judge",
      "9876543211",
      "judge-attendee@pi-dash.test"
    );
    await roster.verifyTableControls("Judge", "E2E Invited Judge");
    await roster.assign(
      "E2E Invited Judge",
      competitions.map((competition) => competition.name)
    );
    const initial = await readState();
    const guest = initial.attendees.find(
      (attendee) => attendee.kind === "guest"
    );
    const judge = initial.attendees.find(
      (attendee) => attendee.kind === "judge"
    );
    if (!guest || !judge) throw new Error("UI did not persist both attendees");
    expect(guest.email).toBeNull();
    expect(initial.accounts).toEqual([]);
    expect(
      initial.assignments.map((assignment) => assignment.competitionId).sort()
    ).toEqual(competitions.map((competition) => competition.id).sort());
    expect(
      initial.assignments.every(
        (assignment) => assignment.attendeeId === judge.id
      )
    ).toBe(true);

    const sheets = new KalakritiPersonQrPage(page);
    for (const attendee of [guest, judge]) {
      const sheet = await sheets.open(
        data.year,
        attendee.kind === "guest" ? "guests" : "judges",
        attendee.name
      );
      expect(JSON.parse(await sheets.decodeQr(sheet))).toEqual({
        id: attendee.id,
        type: attendee.kind,
      });
      await page.keyboard.press("Escape");
    }
    const coordinatorPage = new KalakritiAttendeePage(
      await coordinator.newPage()
    );
    for (const [kind, attendee] of [
      ["Guest", guest],
      ["Judge", judge],
    ] as const) {
      await coordinatorPage.goto(data.year, kind);
      await expect(coordinatorPage.row(attendee.name)).toBeVisible();
      await expect(
        coordinatorPage.page.getByRole("button", {
          name: `Add ${kind}`,
          exact: true,
        })
      ).toHaveCount(0);
    }
    const eventsPage = new KalakritiAttendeePage(await events.newPage());
    await eventsPage.goto(data.year, "Judge");
    await expect(eventsPage.row(judge.name)).toBeVisible();
    await expect(
      eventsPage.page.getByRole("button", { name: "Add Judge", exact: true })
    ).toHaveCount(0);
    await eventsPage.editJudge(judge.name, "E2E Judge Updated by Events Lead");
    judge.name = "E2E Judge Updated by Events Lead";
    await eventsPage.assign(judge.name, [competitions[0]!.name]);
    const leadEdited = await readState();
    expect(
      leadEdited.attendees.find((attendee) => attendee.id === judge.id)?.name
    ).toBe(judge.name);
    expect(
      leadEdited.assignments
        .filter((assignment) => assignment.attendeeId === judge.id)
        .map((assignment) => assignment.competitionId)
    ).toEqual([competitions[0]!.id]);
    await eventsPage.assign(
      judge.name,
      competitions.map((competition) => competition.name)
    );
    for (const [name, args] of [
      [
        "kalakritiAttendee.update",
        { id: guest.id, name: "Unauthorized Guest edit" },
      ],
      ["kalakritiAttendee.archive", { id: judge.id }],
      [
        "kalakritiAttendee.create",
        {
          kind: "judge",
          name: "Unauthorized new Judge",
          phone: "+919876543211",
        },
      ],
      [
        "kalakritiAttendee.setCompetitions",
        { id: guest.id, competitionIds: [] },
      ],
    ] as const) {
      const denied = await mutate(events.request, name, {
        ...command(data.editionId),
        ...args,
      });
      expect(denied.error).toBeTruthy();
    }
    const deniedAssignment = await mutate(
      coordinator.request,
      "kalakritiAttendee.setCompetitions",
      {
        ...command(data.editionId),
        id: judge.id,
        competitionIds: [],
      }
    );
    expect(deniedAssignment.error).toBeTruthy();
    const guestAssignment = await mutate(
      request,
      "kalakritiAttendee.setCompetitions",
      {
        ...command(data.editionId),
        id: guest.id,
        competitionIds: competitions.map((competition) => competition.id),
      }
    );
    expect(guestAssignment.error).toBeTruthy();

    const scanner = new KalakritiScanPage(page);
    await scanner.installDecoder();
    await scanner.goto(data.year);
    await scanner.open();
    await scanner.dialog
      .getByRole("tab", { name: "Check-in", exact: true })
      .click();
    for (const attendee of [guest, judge]) {
      const personQr = JSON.stringify({ id: attendee.id, type: attendee.kind });
      const beforeCheckIn = await mutate(request, "kalakritiOperation.record", {
        ...command(data.editionId),
        type: "breakfast",
        personQr,
      });
      expect(beforeCheckIn.error).toBeTruthy();
      const crossEdition = await mutate(request, "kalakritiOperation.record", {
        ...command(data.foreignEditionId),
        type: "attendee_check_in",
        personQr,
      });
      expect(crossEdition.error).toBeTruthy();
      const mismatch = await mutate(request, "kalakritiOperation.record", {
        ...command(data.editionId),
        type: "attendee_check_in",
        personQr: JSON.stringify({
          id: attendee.id,
          type: attendee.kind === "guest" ? "judge" : "guest",
        }),
      });
      expect(mismatch.error).toBeTruthy();
      if (attendee.kind === "guest") {
        await scanner.scan(personQr, 3);
      } else {
        await scanner.dialog.getByLabel("Yearly ID").fill(attendee.humanId);
        await scanner.dialog
          .getByRole("button", { name: "Record check-in", exact: true })
          .click();
      }
      await expect
        .poll(
          async () =>
            (await readState()).operations.filter(
              (operation) =>
                operation.attendeeId === attendee.id &&
                operation.type === "attendee_check_in"
            ).length
        )
        .toBe(1);
      const checkIn = {
        ...command(data.editionId),
        type: "attendee_check_in",
        personQr,
      };
      expect(
        (await mutate(request, "kalakritiOperation.record", checkIn)).error
      ).toBeUndefined();
      expect(
        (await mutate(request, "kalakritiOperation.record", checkIn)).error
      ).toBeUndefined();
      const duplicateMeals = await Promise.all(
        [1, 2].map(() =>
          mutate(request, "kalakritiOperation.record", {
            ...command(data.editionId),
            type: "breakfast",
            personQr,
          })
        )
      );
      expect(duplicateMeals.every((result) => !result.error)).toBe(true);
      expect(
        (
          await mutate(request, "kalakritiOperation.recordManual", {
            ...command(data.editionId),
            type: "lunch",
            humanId: attendee.humanId,
          })
        ).error
      ).toBeUndefined();
    }
    await scanner.close();
    const served = await readState();
    for (const attendee of [guest, judge]) {
      expect(
        served.operations
          .filter((operation) => operation.attendeeId === attendee.id)
          .map((operation) => operation.type)
          .sort()
      ).toEqual(["attendee_check_in", "breakfast", "lunch"]);
    }
    const breakfast = served.operations.find(
      (operation) =>
        operation.attendeeId === guest.id && operation.type === "breakfast"
    );
    if (!breakfast) throw new Error("Breakfast operation is missing");
    expect(
      (
        await mutate(request, "kalakritiOperation.undoMeal", {
          ...command(data.editionId),
          targetOperationId: breakfast.id,
        })
      ).error
    ).toBeUndefined();
    expect(
      (
        await mutate(request, "kalakritiOperation.record", {
          ...command(data.editionId),
          type: "breakfast",
          personQr: JSON.stringify({ id: guest.id, type: "guest" }),
        })
      ).error
    ).toBeUndefined();
    expect(
      (
        await mutate(request, "kalakritiAttendee.archive", {
          ...command(data.editionId),
          id: guest.id,
        })
      ).error
    ).toBeUndefined();
    expect(
      (
        await mutate(request, "kalakritiOperation.record", {
          ...command(data.editionId),
          type: "lunch",
          personQr: JSON.stringify({ id: guest.id, type: "guest" }),
        })
      ).error
    ).toBeTruthy();
    const archived = await readState();
    expect(
      archived.attendees.find((attendee) => attendee.id === guest.id)
        ?.archivedAt
    ).not.toBeNull();
    expect(
      archived.operations.filter(
        (operation) => operation.attendeeId === guest.id
      )
    ).toHaveLength(5);
    expect(archived.accounts).toEqual([]);
  } finally {
    await Promise.allSettled([
      coordinator.close(),
      events.close(),
      page.close(),
    ]);
    await fixture("attendee", "cleanup", data.editionId);
    await fixture("station", "cleanup");
  }
});
