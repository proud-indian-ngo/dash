import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { KALAKRITI_ACTORS } from "../../fixtures/kalakriti-actors";
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
    deletedAt: string | null;
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
async function sendMutation(
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
  return response;
}
async function mutate(
  request: APIRequestContext,
  name: string,
  input: Record<string, unknown>
) {
  const response = await sendMutation(request, name, input);
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
    ["kalakritiTransport.delete", args(data.editionId, assignmentId)],
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
      "Admin workflow with explicit Transport Lead, Liaison, and Guardian contexts"
    )
  );

  test("admin deletion is cancelable, hides soft-deleted vehicles, and preserves history without a manual advancement API", async ({
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
      await transport.expectNoAdvanceControls();
      const before = await fixture<State>("state");
      const assignment = before.assignments.find(
        (item) => item.centerId === data.centerA
      )!;
      const removedApi = await sendMutation(
        page.request,
        "kalakritiTransport.transitionStatus",
        args(data.editionId, assignment.id)
      );
      if (removedApi.ok())
        expect(
          (await removedApi.json()).mutations?.[0]?.result?.error
        ).toBeDefined();
      else expect(removedApi.status()).toBeGreaterThanOrEqual(400);
      expect(await fixture<State>("state")).toEqual(before);
      const confirmation = await transport.openDelete("Bus 2");
      await confirmation
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(confirmation).toBeHidden();
      await expect(
        page.getByRole("heading", { name: "Bus 2", exact: true })
      ).toBeVisible();
      expect(await fixture<State>("state")).toEqual(before);
      await transport.deleteVehicle("Bus 2");
      const after = await fixture<State>("state");
      expect(
        after.assignments.find((item) => item.id === assignment.id)
      ).toEqual({ ...assignment, deletedAt: expect.any(String) });
      expect(after.history).toEqual(before.history);
      await transport.goto(data.year, "Transport Center A");
      await expect(
        page.getByRole("heading", { name: "Bus 2", exact: true })
      ).toHaveCount(0);
      const repeated = await mutate(
        page.request,
        "kalakritiTransport.delete",
        args(data.editionId, assignment.id)
      );
      expect(repeated.error).toBeUndefined();
      const editDeleted = await mutate(
        page.request,
        "kalakritiTransport.update",
        {
          ...args(data.editionId, assignment.id),
          vehicleLabel: "Resurrected Bus",
        }
      );
      expect(editDeleted.error).toBeDefined();
      expect(await fixture<State>("state")).toEqual(after);
    } finally {
      if (!page.isClosed()) await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("Transport Leads manage all Centers while Liaisons and Guardians only read their Center", async ({
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
    const leadContext = await browser.newContext({
      baseURL,
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/volunteer.json"
      ),
    });
    const liaisonContext = await browser.newContext({
      baseURL,
      storageState: path.resolve(
        import.meta.dirname,
        "../..",
        KALAKRITI_ACTORS.liaison.authFile
      ),
    });
    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const lead = await leadContext.newPage();
      const transport = new KalakritiTransportPage(lead);
      await transport.goto(data.year, "Transport Center A");
      await transport.addVehicle("Scoped Bus", "Scoped Driver");
      await transport.editVehicle(
        "Scoped Bus",
        "Scoped Bus Updated",
        "Updated Driver"
      );
      await transport.expectNoAdvanceControls();
      await transport.goto(data.year, "Transport Center B");
      await transport.editVehicle(
        "Restricted Bus",
        "Center B Bus",
        "Center B Driver"
      );
      await transport.expectNoAdvanceControls();
      await transport.addVehicle("Second Center B Bus", "Second Driver");
      const beforeDenied = await fixture<State>("state");
      expect(
        beforeDenied.assignments.filter(
          (assignment) => assignment.centerId === data.centerB
        )
      ).toHaveLength(2);
      const scopedAssignment = beforeDenied.assignments.find(
        (assignment) => assignment.centerId === data.centerA
      )!;

      const liaison = await liaisonContext.newPage();
      const guardian = await guardianContext.newPage();
      await signIn(guardian, data.guardianEmail, data.guardianPassword);
      for (const reader of [liaison, guardian]) {
        const readerTransport = new KalakritiTransportPage(reader);
        await readerTransport.goto(data.year, "Transport Center A");
        await readerTransport.expectNoAdvanceControls();
        await expect(
          reader.getByRole("heading", {
            name: "Scoped Bus Updated",
            exact: true,
          })
        ).toBeVisible();
        await expect(
          reader.getByText("Driver: Updated Driver", { exact: true })
        ).toBeVisible();
        for (const name of [
          "Add vehicle",
          "Edit",
          "Delete",
          "Arrived at venue",
        ])
          await expect(
            reader.getByRole("button", { name, exact: true })
          ).toHaveCount(0);
        await assertTransportDenied(
          reader.request,
          data,
          data.centerA,
          scopedAssignment.id
        );
        expect(await fixture<State>("state")).toEqual(beforeDenied);
        await reader.goto(`/kalakriti/${data.year}/centers/${data.centerB}`);
        await expect(
          reader.getByRole("heading", { name: "Center not found", exact: true })
        ).toBeVisible();
        await expect(
          reader.getByText("Center B Driver", { exact: false })
        ).toHaveCount(0);
      }

      await transport.goto(data.year, "Transport Center B");
      await transport.deleteVehicle("Center B Bus");
      await transport.goto(data.year, "Transport Center A");
      await transport.deleteVehicle("Scoped Bus Updated");
      const afterDeletion = await fixture<State>("state");
      expect(
        afterDeletion.assignments.find(
          (item) => item.id === data.restrictedAssignment
        )?.deletedAt
      ).toEqual(expect.any(String));
      expect(
        afterDeletion.assignments.find(
          (item) => item.id === scopedAssignment.id
        )?.deletedAt
      ).toEqual(expect.any(String));
      expect(afterDeletion.history).toEqual(beforeDenied.history);
      expect(
        afterDeletion.history.filter(
          (row) => row.assignmentId === data.restrictedAssignment
        )
      ).toHaveLength(3);
      await new KalakritiTransportPage(guardian).goto(
        data.year,
        "Transport Center A"
      );
      await expect(
        guardian.getByRole("heading", {
          name: "Scoped Bus Updated",
          exact: true,
        })
      ).toHaveCount(0);
      const remaining = afterDeletion.assignments.find(
        (item) => item.vehicleLabel === "Second Center B Bus"
      )!;
      await fixture("archive");
      await new KalakritiTransportPage(page).goto(
        data.year,
        "Transport Center B"
      );
      await expect(
        page.getByRole("heading", { name: "Second Center B Bus", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Center B Bus", exact: true })
      ).toHaveCount(0);
      for (const name of [
        "Add vehicle",
        "Edit",
        "Delete",
        "Arrived at Center",
        "Arrived at venue",
      ])
        await expect(
          page.getByRole("button", { name, exact: true })
        ).toHaveCount(0);
      const archived = await mutate(
        page.request,
        "kalakritiTransport.delete",
        args(data.editionId, remaining.id)
      );
      expect(archived.error).toBeDefined();
      expect(archived.message).toContain("archived");
      expect(await fixture<State>("state")).toEqual(afterDeletion);
    } finally {
      for (const context of [leadContext, liaisonContext, guardianContext])
        if (context.pages().length) await context.close();
      if (!page.isClosed()) await page.goto("about:blank");
      await fixture("cleanup");
    }
  });
});
