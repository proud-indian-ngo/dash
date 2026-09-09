import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";

// Live Edition uniqueness is shared with the other release-invariant specs.
test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-operations.ts"
);
interface Setup {
  editionId: string;
  otherEditionId: string;
  otherStudentId: string;
  studentId: string;
  volunteerId: string;
  guardianId: string;
  inactiveId: string;
  foreignVolunteerId: string;
  entryId: string;
  year: number;
}
interface State {
  operations: Array<{
    operationId: string;
    studentId: string | null;
    membershipId: string | null;
    type: string;
  }>;
  audits: Array<{ action: string }>;
  students: Array<{ id: string }>;
  entries: Array<{ id: string }>;
}
async function fixture<T>(
  action: "setup" | "state" | "registration-open" | "cleanup",
  email?: string,
  liaisonEmail?: string
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      helper,
      action,
      ...(email ? [email] : []),
      ...(liaisonEmail ? [liaisonEmail] : []),
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

// Exercise the authenticated HTTP mutation boundary, as edition-creation.spec.ts does.
// Each request uses a new transport client so replay tests reach operationId deduplication.
async function mutate(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
) {
  const requestId = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `operations-e2e-${requestId}`,
        mutations: [
          {
            args: [args],
            clientID: requestId,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
        pushVersion: 1,
        requestID: requestId,
        timestamp: Date.now(),
      },
    }
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.mutations).toHaveLength(1);
  return body.mutations[0].result as { error?: string; message?: string };
}
function operation(
  editionId: string,
  personId: string,
  personType: string,
  type: string
) {
  const now = Date.now();
  return {
    editionId,
    personQr: JSON.stringify({ id: personId, type: personType }),
    type,
    id: uuidv7(),
    auditEntryId: uuidv7(),
    operationId: uuidv7(),
    now,
    occurredAt: now,
  };
}

test("authorized operations resolve JSON people, reject invalid subjects, replay safely, and protect history", async ({
  page,
  superAdminEmail,
  browser,
  baseURL,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Operations integration fixture"
  );
  test.slow();
  const setup = await fixture<Setup>(
    "setup",
    superAdminEmail,
    kalakritiActors.liaison.email
  );
  try {
    const initial = await fixture<State>("state");
    expect(initial.operations).toEqual([]);
    const pickup = operation(
      setup.editionId,
      setup.studentId,
      "student",
      "pickup"
    );
    expect(
      (await mutate(page.request, "kalakritiOperation.record", pickup)).error
    ).toBeUndefined();
    const checkIn = operation(
      setup.editionId,
      setup.volunteerId,
      "volunteer",
      "volunteer_check_in"
    );
    expect(
      (await mutate(page.request, "kalakritiOperation.record", checkIn)).error
    ).toBeUndefined();
    let recorded = await fixture<State>("state");
    expect(recorded.operations).toEqual(
      expect.arrayContaining([
        {
          operationId: pickup.operationId,
          studentId: setup.studentId,
          membershipId: null,
          type: "pickup",
        },
        {
          operationId: checkIn.operationId,
          studentId: null,
          membershipId: setup.volunteerId,
          type: "volunteer_check_in",
        },
      ])
    );
    expect(recorded.operations).toHaveLength(2);
    expect(recorded.audits).toEqual([
      { action: "recorded" },
      { action: "recorded" },
    ]);
    expect(
      (await mutate(page.request, "kalakritiOperation.record", pickup)).error
    ).toBeUndefined();
    expect(await fixture<State>("state")).toEqual(recorded);

    for (const args of [
      operation(setup.otherEditionId, setup.studentId, "student", "pickup"),
      operation(
        setup.editionId,
        setup.foreignVolunteerId,
        "volunteer",
        "volunteer_check_in"
      ),
      operation(
        setup.editionId,
        setup.studentId,
        "volunteer",
        "volunteer_check_in"
      ),
      operation(setup.editionId, setup.volunteerId, "student", "pickup"),
      operation(
        setup.editionId,
        setup.guardianId,
        "guardian",
        "volunteer_check_in"
      ),
      operation(
        setup.editionId,
        setup.inactiveId,
        "volunteer",
        "volunteer_check_in"
      ),
      {
        ...operation(setup.editionId, setup.studentId, "student", "pickup"),
        personQr: "not JSON",
      },
    ]) {
      expect(
        (await mutate(page.request, "kalakritiOperation.record", args)).error
      ).toBe("app");
      expect(await fixture<State>("state")).toEqual(recorded);
    }

    const liaisonContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.liaison.storageState,
    });
    try {
      // A matching Center liaison can record transport, but not another Center or staff role's operation.
      expect(
        (
          await mutate(
            liaisonContext.request,
            "kalakritiOperation.record",
            operation(
              setup.editionId,
              setup.studentId,
              "student",
              "venue_departure"
            )
          )
        ).error
      ).toBeUndefined();
      recorded = await fixture<State>("state");
      expect(recorded.operations).toHaveLength(3);
      for (const args of [
        operation(setup.editionId, setup.otherStudentId, "student", "pickup"),
        operation(setup.editionId, setup.studentId, "student", "breakfast"),
        operation(
          setup.editionId,
          setup.volunteerId,
          "volunteer",
          "volunteer_check_in"
        ),
      ]) {
        expect(
          (
            await mutate(
              liaisonContext.request,
              "kalakritiOperation.record",
              args
            )
          ).error
        ).toBe("app");
        expect(await fixture<State>("state")).toEqual(recorded);
      }
    } finally {
      await liaisonContext.close();
    }

    const guardianContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.guardian.storageState,
    });
    try {
      expect(
        (
          await mutate(
            guardianContext.request,
            "kalakritiOperation.record",
            operation(setup.editionId, setup.studentId, "student", "breakfast")
          )
        ).error
      ).toBe("app");
      expect(await fixture<State>("state")).toEqual(recorded);
    } finally {
      await guardianContext.close();
    }

    const { personQr: _personQr, ...manual } = operation(
      setup.editionId,
      setup.volunteerId,
      "volunteer",
      "breakfast"
    );
    expect(
      (
        await mutate(page.request, "kalakritiOperation.recordManual", {
          ...manual,
          humanId: `KALV-${setup.year}-0001`,
        })
      ).error
    ).toBeUndefined();
    const afterManual = await fixture<State>("state");
    expect(afterManual.operations).toHaveLength(4);
    expect(afterManual.operations).toContainEqual({
      operationId: manual.operationId,
      studentId: null,
      membershipId: setup.volunteerId,
      type: "breakfast",
    });

    await fixture("registration-open");
    expect(
      (await mutate(page.request, "kalakritiOperation.record", pickup)).error
    ).toBeUndefined();
    expect(await fixture<State>("state")).toEqual(afterManual);
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.record",
          operation(setup.editionId, setup.studentId, "student", "breakfast")
        )
      ).error
    ).toBe("app");
    for (const [name, subject] of [
      ["kalakritiStudent.delete", { studentId: setup.studentId }],
      ["kalakritiEntry.remove", { entryId: setup.entryId }],
    ] as const) {
      const result = await mutate(page.request, name, {
        ...subject,
        auditEntryId: uuidv7(),
        now: Date.now(),
      });
      expect(result.error).toBe("app");
      expect(JSON.stringify(result)).toContain("event-day operations");
      expect(await fixture<State>("state")).toEqual(afterManual);
    }
  } finally {
    await fixture("cleanup");
  }
});
