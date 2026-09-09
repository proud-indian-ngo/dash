import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiTransportPage } from "../../pages/kalakriti-transport-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-transport.ts"
);
interface Fixture {
  editionId: string;
  centerA: string;
  centerB: string;
  restrictedAssignment: string;
  guardianEmail: string;
  guardianPassword: string;
  year: number;
}
interface State {
  assignments: {
    id: string;
    centerId: string;
    vehicleLabel: string;
    driverName: string;
    status: string;
  }[];
  history: {
    assignmentId: string;
    fromStatus: string | null;
    toStatus: string;
  }[];
}
async function fixture<T>(action: string, ...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...args],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
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
        clientGroupID: `transport-e2e-${id}`,
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
function args(editionId: string, assignmentId: string) {
  return {
    editionId,
    assignmentId,
    auditEntryId: uuidv7(),
    historyId: uuidv7(),
    changeId: uuidv7(),
    now: Date.now(),
    occurredAt: Date.now(),
  };
}
async function assertTransportDenied(
  request: APIRequestContext,
  data: Fixture,
  centerId: string,
  assignmentId: string
) {
  for (const [name, input] of [
    [
      "kalakritiTransport.create",
      {
        ...args(data.editionId, uuidv7()),
        centerId,
        vehicleLabel: "Forbidden Bus",
        driverName: "Forbidden Driver",
        capacity: 20,
        driverPhone: null,
        notes: null,
      },
    ],
    [
      "kalakritiTransport.update",
      { ...args(data.editionId, assignmentId), driverName: "Forbidden Driver" },
    ],
    ["kalakritiTransport.transitionStatus", args(data.editionId, assignmentId)],
  ] as const) {
    const result = await mutate(request, name, input);
    expect(result.error).toBeDefined();
    expect(result.message).toContain("Unauthorized");
  }
}

test.describe("Center transport", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() =>
    test.skip(
      test.info().project.name !== "super_admin",
      "Admin workflow with explicit scoped coordinator and Guardian contexts"
    )
  );

  test("creates, edits, and advances through every forward status without advancing past Completed", async ({
    page,
    superAdminEmail,
    volunteerEmail,
  }) => {
    test.slow();
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const transport = new KalakritiTransportPage(page);
    try {
      await transport.goto(data.year, "Transport Center A");
      await transport.addVehicle("Bus 1", "Ravi Kumar");
      await transport.editVehicle("Bus 1", "Bus 2", "Anil Kumar");
      for (const [label, status] of [
        ["Arrived at Center", "arrived_at_center"],
        ["Arrived at venue", "arrived_at_venue"],
        ["Departed venue", "departed_venue"],
        ["Completed", "completed"],
      ] as const) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect
          .poll(
            async () =>
              (await fixture<State>("state")).assignments.find(
                (assignment) => assignment.centerId === data.centerA
              )?.status
          )
          .toBe(status);
      }
      await expect(
        page.getByRole("button", { name: "Completed", exact: true })
      ).toHaveCount(0);
      await expect(page.getByText("Completed", { exact: true })).toBeVisible();
      const state = await fixture<State>("state");
      const assignment = state.assignments.find(
        (item) => item.centerId === data.centerA
      )!;
      expect(assignment.driverName).toBe("Anil Kumar");
      expect(
        state.history
          .filter((row) => row.assignmentId === assignment.id)
          .map((row) => row.toStatus)
      ).toEqual([
        "planned",
        "arrived_at_center",
        "arrived_at_venue",
        "departed_venue",
        "completed",
      ]);
      const terminal = await mutate(
        page.request,
        "kalakritiTransport.transitionStatus",
        args(data.editionId, assignment.id)
      );
      expect(terminal.error).toBeDefined();
      expect(terminal.message).toContain("cannot advance further");
      expect(await fixture<State>("state")).toEqual(state);
    } finally {
      if (!page.isClosed()) await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("scopes coordinators to their Center and keeps Guardian and archived transport read-only", async ({
    baseURL,
    browser,
    page,
    superAdminEmail,
    volunteerEmail,
  }) => {
    test.slow();
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const coordinatorContext = await browser.newContext({
      baseURL,
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/volunteer.json"
      ),
    });
    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const coordinator = await coordinatorContext.newPage();
      const transport = new KalakritiTransportPage(coordinator);
      // The fixture grants only transport_coordinator, proving its parent Center remains readable without a Liaison role.
      await transport.goto(data.year, "Transport Center A");
      await transport.addVehicle("Scoped Bus", "Scoped Driver");
      await transport.editVehicle(
        "Scoped Bus",
        "Scoped Bus Updated",
        "Updated Driver"
      );
      await coordinator
        .getByRole("button", { name: "Arrived at Center", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await fixture<State>("state")).assignments.find(
              (assignment) => assignment.centerId === data.centerA
            )?.status
        )
        .toBe("arrived_at_center");
      const beforeDenied = await fixture<State>("state");
      await assertTransportDenied(
        coordinator.request,
        data,
        data.centerB,
        data.restrictedAssignment
      );
      expect(await fixture<State>("state")).toEqual(beforeDenied);
      await coordinator.goto(`/kalakriti/${data.year}/centers/${data.centerB}`);
      await expect(
        coordinator.getByRole("heading", {
          name: "Center not found",
          exact: true,
        })
      ).toBeVisible();
      await expect(
        coordinator.getByText("Restricted Driver", { exact: false })
      ).toHaveCount(0);
      await expect(
        coordinator.getByRole("button", { name: "Add vehicle", exact: true })
      ).toHaveCount(0);

      const guardian = await guardianContext.newPage();
      await signIn(guardian, data.guardianEmail, data.guardianPassword);
      await new KalakritiTransportPage(guardian).goto(
        data.year,
        "Transport Center A"
      );
      await expect(
        guardian.getByRole("button", { name: "Add vehicle", exact: true })
      ).toHaveCount(0);
      await expect(
        guardian.getByRole("heading", {
          name: "Scoped Bus Updated",
          exact: true,
        })
      ).toBeVisible();
      await expect(
        guardian.getByText("Driver: Updated Driver", { exact: true })
      ).toBeVisible();
      for (const name of ["Edit", "Arrived at venue"])
        await expect(
          guardian.getByRole("button", { name, exact: true })
        ).toHaveCount(0);
      const scopedAssignment = beforeDenied.assignments.find(
        (assignment) => assignment.centerId === data.centerA
      )!;
      await assertTransportDenied(
        guardian.request,
        data,
        data.centerA,
        scopedAssignment.id
      );
      expect(await fixture<State>("state")).toEqual(beforeDenied);
      await guardian.goto(`/kalakriti/${data.year}/centers/${data.centerB}`);
      await expect(
        guardian.getByRole("heading", { name: "Center not found", exact: true })
      ).toBeVisible();
      await expect(
        guardian.getByText("Restricted Driver", { exact: false })
      ).toHaveCount(0);

      await fixture("archive");
      await new KalakritiTransportPage(page).goto(
        data.year,
        "Transport Center B"
      );
      await expect(
        page.getByRole("heading", { name: "Restricted Bus", exact: true })
      ).toBeVisible();
      for (const name of ["Add vehicle", "Edit", "Arrived at Center"])
        await expect(
          page.getByRole("button", { name, exact: true })
        ).toHaveCount(0);
      const archived = await mutate(page.request, "kalakritiTransport.update", {
        ...args(data.editionId, data.restrictedAssignment),
        driverName: "Archived edit",
      });
      expect(archived.error).toBeDefined();
      expect(archived.message).toContain("archived");
      expect(await fixture<State>("state")).toEqual(beforeDenied);
    } finally {
      if (coordinatorContext.pages().length) await coordinatorContext.close();
      if (guardianContext.pages().length) await guardianContext.close();
      if (!page.isClosed()) await page.goto("about:blank");
      await fixture("cleanup");
    }
  });
});
