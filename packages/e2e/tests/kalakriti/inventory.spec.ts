import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiInventoryPage } from "../../pages/kalakriti-inventory-page";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";

const execFileAsync = promisify(execFile);
test.use({ actionTimeout: 10_000 });
interface Fixture {
  editionId: string;
  year: number;
  memberId: string;
  memberName: string;
  memberHumanId: string;
  leadHumanId: string;
  leadName: string;
  unassignedHumanId: string;
  unassignedName: string;
  competitionId: string;
  unrelatedCompetitionId: string;
}
interface State {
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPricePaise: number;
    archivedAt: string | null;
  }[];
  transactions: {
    id: string;
    type: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    responsibility: string | null;
    notes: string | null;
  }[];
}
async function fixture<T>(action: string, ...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/kalakriti-inventory.ts"),
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
        clientGroupID: `inventory-${id}`,
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
function command(editionId: string, itemId: string) {
  return {
    editionId,
    itemId,
    transactionId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
  };
}
function movement(data: Fixture, itemId: string, quantity: number) {
  return {
    ...command(data.editionId, itemId),
    type: "dispatch",
    quantity,
    volunteerMembershipId: data.memberId,
    competitionId: data.competitionId,
    notes: "Drawing supplies",
  };
}
function batch(
  data: Fixture,
  lines: Array<{ itemId: string; quantity: number }>
) {
  return {
    editionId: data.editionId,
    type: "dispatch",
    volunteerMembershipId: data.memberId,
    competitionId: data.competitionId,
    notes: "Drawing supplies",
    now: Date.now(),
    items: lines.map((line) => ({
      ...line,
      transactionId: uuidv7(),
      auditEntryId: uuidv7(),
    })),
  };
}

test.describe("Kalakriti inventory", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() =>
    test.skip(
      test.info().project.name !== "super_admin",
      "Inventory with explicit logistics and denied contexts"
    )
  );
  test.afterEach(async () => {
    await fixture("cleanup");
  });

  test("logistics member scans a volunteer, moves multiple items, filters history, and archives/restores zero stock", async ({
    browser,
    baseURL,
    superAdminEmail,
    volunteerEmail,
  }) => {
    test.slow();
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const context = await browser.newContext({
      baseURL,
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/volunteer.json"
      ),
    });
    try {
      const page = await context.newPage();
      const scanner = new KalakritiScanPage(page);
      await scanner.installDecoder();
      const inventory = new KalakritiInventoryPage(page);
      await inventory.goto(data.year);
      await inventory.create("Drawing pencils", 10);
      await inventory.create("Paint brushes", 8);
      await inventory.move("Drawing pencils", "Purchase", 5);
      await page.getByRole("button", { name: "Scan", exact: true }).click();
      const sidebarScan = page.getByRole("dialog", {
        name: "Scan",
        exact: true,
      });
      await expect(
        sidebarScan.getByRole("tab", { name: "Dispatch" })
      ).toBeVisible();
      await expect(
        sidebarScan.getByRole("tab", { name: "Return" })
      ).toBeVisible();
      await sidebarScan.getByRole("button", { name: "Close" }).click();
      await expect(
        inventory
          .item("Drawing pencils")
          .getByRole("button", { name: "Actions for Drawing pencils" })
      ).toBeVisible();
      await expect(
        inventory
          .item("Drawing pencils")
          .getByRole("cell")
          .filter({
            has: page.getByRole("button", {
              name: "Actions for Drawing pencils",
            }),
          })
      ).toHaveCSS("text-overflow", "clip");
      const dispatch = await inventory.openScan("Dispatch");
      await dispatch
        .getByRole("textbox", { name: "Volunteer yearly ID" })
        .fill("KALV-2157-9999");
      await dispatch.getByRole("button", { name: "Find volunteer" }).click();
      await expect(
        dispatch.getByRole("region", { name: "Scanned volunteer" })
      ).toHaveCount(0);
      await inventory.findVolunteer(data.memberHumanId, data.memberName);
      await dispatch.getByRole("button", { name: "Dispatch items" }).click();
      await expect(
        dispatch.getByRole("region", { name: "Scanned volunteer" })
      ).toBeVisible();
      await inventory.selectItem("Drawing pencils", 15, 0);
      await expect(
        dispatch.getByRole("button", { name: "Dispatch items" })
      ).toBeDisabled();
      await dispatch
        .getByRole("spinbutton", { name: "Drawing pencils quantity" })
        .fill("4");
      await inventory.selectItem("Paint brushes", 8, 3);
      await dispatch.getByLabel("Competition / role", { exact: true }).click();
      await page.getByRole("option", { name: "Drawing", exact: true }).click();
      await dispatch
        .getByRole("textbox", { name: "Purpose / notes" })
        .fill("Drawing supplies");
      await dispatch.getByRole("button", { name: "Dispatch items" }).click();
      await expect(
        dispatch.getByRole("region", { name: "Scanned volunteer" })
      ).toHaveCount(0);
      await dispatch.getByRole("button", { name: "Close" }).click();

      const returned = await inventory.openScan("Return");
      await scanner.expectCameraActive(true);
      await scanner.scan(
        JSON.stringify({ id: data.memberId, type: "student" })
      );
      await expect(
        returned.getByRole("region", { name: "Scanned volunteer" })
      ).toHaveCount(0);
      await scanner.holdFrame();
      await scanner.scan(
        JSON.stringify({ id: data.memberId, type: "volunteer" }),
        3
      );
      const returnedProfile = returned.getByRole("region", {
        name: "Scanned volunteer",
      });
      await expect(returnedProfile).toContainText(data.memberName);
      await expect(returnedProfile).toContainText(data.memberHumanId);
      await scanner.expectCameraActive(false);
      await scanner.emitHeldFrame(
        JSON.stringify({ id: data.memberId, type: "volunteer" })
      );
      expect((await fixture<State>("state")).transactions).toHaveLength(5);
      await inventory.selectItem("Drawing pencils", 11, 2);
      await inventory.selectItem("Paint brushes", 5, 1);
      await returned.getByLabel("Competition / role", { exact: true }).click();
      await page
        .getByRole("option", { name: "Logistics Member", exact: true })
        .click();
      await returned
        .getByRole("textbox", { name: "Purpose / notes" })
        .fill("Drawing supplies");
      await returned.getByRole("button", { name: "Return items" }).click();
      await expect(
        returned.getByRole("region", { name: "Scanned volunteer" })
      ).toHaveCount(0);
      await returned.getByRole("button", { name: "Close" }).click();
      await inventory.openAction("Drawing pencils", "Adjust stock");
      const adjustment = page.getByRole("dialog", {
        name: "Adjustment · Drawing pencils",
        exact: true,
      });
      await adjustment.getByLabel("Counted stock").fill("0");
      await adjustment
        .getByRole("textbox", { name: "Reason", exact: true })
        .fill(" ");
      await expect(
        adjustment.getByRole("button", {
          name: "Record adjustment",
          exact: true,
        })
      ).toBeDisabled();
      await adjustment
        .getByRole("textbox", { name: "Reason", exact: true })
        .fill("Counted after event");
      await expect(adjustment).toContainText("-13");
      await adjustment
        .getByRole("button", { name: "Record adjustment", exact: true })
        .click();
      await expect(adjustment).toBeHidden();
      const state = await fixture<State>("state");
      expect(
        state.items.find((item) => item.name === "Drawing pencils")
      ).toMatchObject({
        quantity: 0,
        unitPricePaise: 1250,
      });
      expect(
        state.items.find((item) => item.name === "Paint brushes")?.quantity
      ).toBe(6);
      expect(state.transactions).toHaveLength(8);
      expect(
        state.transactions
          .filter((row) => row.type === "dispatch")
          .map((row) => row.quantity)
          .sort((a, b) => a - b)
      ).toEqual([-4, -3]);
      expect(
        state.transactions
          .filter((row) => row.type === "return")
          .map((row) => row.quantity)
          .sort((a, b) => a - b)
      ).toEqual([1, 2]);
      expect(
        state.transactions
          .filter((row) => row.type === "return")
          .map((row) => row.responsibility)
      ).toEqual(["logistics_member", "logistics_member"]);
      expect(
        state.transactions.find((row) => row.type === "adjustment")
      ).toMatchObject({ quantity: -13, quantityAfter: 0 });
      await inventory.openAction("Drawing pencils", "Archive item");
      const confirmation = page.getByRole("alertdialog");
      await confirmation
        .getByRole("button", { name: "Archive item", exact: true })
        .click();
      await expect(confirmation).toBeHidden();
      await inventory.openAction("Drawing pencils", "Restore item");
      await expect(inventory.item("Drawing pencils")).toContainText("Active");
      await inventory.openAction("Drawing pencils", "History");
      const itemHistory = page.getByRole("dialog", {
        name: "Drawing pencils history",
      });
      await expect(itemHistory.getByRole("table")).toContainText(
        "Opening stock"
      );
      await expect
        .poll(async () => (await itemHistory.boundingBox())?.width ?? 0)
        .toBeGreaterThan((page.viewportSize()?.width ?? 1280) * 0.9);
      await expect(itemHistory.getByRole("table")).toContainText(
        "Counted after event"
      );
      await expect(itemHistory.getByRole("table")).toContainText(
        "Logistics Member"
      );
      await itemHistory.getByRole("button", { name: "Close" }).click();
      await page
        .getByRole("tab", { name: "Transactions", exact: true })
        .click();
      await expect(page.getByRole("table")).toContainText("Opening stock");
      await expect(page.getByRole("table")).toContainText(
        "Counted after event"
      );
      const search = page.getByPlaceholder("Search...");
      await search.fill("Counted after event");
      await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
      await search.clear();
      await expect(page.getByRole("table").getByRole("row")).toHaveCount(9);
      expect((await fixture<State>("state")).transactions).toHaveLength(8);
    } finally {
      await context.close();
    }
  });

  test("scan offers only the volunteer's assigned competitions and roles", async ({
    page,
    superAdminEmail,
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    await new KalakritiScanPage(page).installDecoder();
    const inventory = new KalakritiInventoryPage(page);
    await inventory.goto(data.year);
    const dialog = await inventory.openScan("Dispatch");
    await inventory.findVolunteer(data.memberHumanId, data.memberName);
    const selection = dialog.getByLabel("Competition / role", { exact: true });
    await expect(selection).toBeVisible();
    await selection.click();
    await expect(
      page.getByRole("option", { name: "Drawing", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Logistics Member", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Singing", exact: true })
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await dialog
      .getByRole("button", { name: "Scan another volunteer" })
      .click();
    await inventory.findVolunteer(data.leadHumanId, data.leadName);
    await selection.click();
    await expect(
      page.getByRole("option", { name: "Logistics Lead", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Drawing", exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", { name: "Singing", exact: true })
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await dialog
      .getByRole("button", { name: "Scan another volunteer" })
      .click();
    await inventory.findVolunteer(data.unassignedHumanId, data.unassignedName);
    await expect(selection).toHaveCount(0);
    await expect(dialog).toContainText(
      "This volunteer has no current role or competition assignments."
    );
    await dialog.getByRole("tab", { name: "Return" }).click();
    await inventory.findVolunteer(data.leadHumanId, data.leadName);
    await selection.click();
    await expect(
      page.getByRole("option", { name: "Logistics Lead", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Drawing", exact: true })
    ).toHaveCount(0);
  });

  test("rejects an invalid batch atomically and replays a successful batch once", async ({
    request,
    superAdminEmail,
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const firstId = uuidv7();
    const secondId = uuidv7();
    for (const [itemId, name, openingQuantity] of [
      [firstId, "Batch pencils", 5],
      [secondId, "Batch brushes", 1],
    ] as const) {
      expect(
        (
          await mutate(request, "kalakritiInventory.create", {
            ...command(data.editionId, itemId),
            name,
            openingQuantity,
            unitPricePaise: 0,
            photo: null,
          })
        ).error
      ).toBeUndefined();
    }
    const unassignedCompetition = {
      ...batch(data, [{ itemId: firstId, quantity: 1 }]),
      competitionId: data.unrelatedCompetitionId,
    };
    expect(
      (
        await mutate(
          request,
          "kalakritiInventory.recordBatch",
          unassignedCompetition
        )
      ).message
    ).toContain("no longer assigned to this volunteer");
    const unassignedRole = {
      ...batch(data, [{ itemId: firstId, quantity: 1 }]),
      competitionId: null,
      responsibility: "food_member",
    };
    expect(
      (await mutate(request, "kalakritiInventory.recordBatch", unassignedRole))
        .message
    ).toContain("no longer assigned to this volunteer");
    const invalid = batch(data, [
      { itemId: firstId, quantity: 4 },
      { itemId: secondId, quantity: 2 },
    ]);
    expect(
      (await mutate(request, "kalakritiInventory.recordBatch", invalid)).message
    ).toContain("Insufficient stock");
    const afterRejection = await fixture<State>("state");
    expect(afterRejection.transactions).toHaveLength(2);
    expect(
      afterRejection.items.find((item) => item.id === firstId)?.quantity
    ).toBe(5);
    expect(
      afterRejection.items.find((item) => item.id === secondId)?.quantity
    ).toBe(1);

    const valid = batch(data, [
      { itemId: firstId, quantity: 4 },
      { itemId: secondId, quantity: 1 },
    ]);
    expect(
      (await mutate(request, "kalakritiInventory.recordBatch", valid)).error
    ).toBeUndefined();
    expect(
      (await mutate(request, "kalakritiInventory.recordBatch", valid)).error
    ).toBeUndefined();
    expect(
      (
        await mutate(request, "kalakritiInventory.recordBatch", {
          ...valid,
          items: valid.items.map((line, index) =>
            index === 0 ? { ...line, quantity: 2 } : line
          ),
        })
      ).message
    ).toContain("already in use");
    const state = await fixture<State>("state");
    expect(state.items.find((item) => item.id === firstId)?.quantity).toBe(1);
    expect(state.items.find((item) => item.id === secondId)?.quantity).toBe(0);
    expect(state.transactions).toHaveLength(4);
  });

  test("serializes competing dispatches, rejects stale counts, and preserves retry history", async ({
    request,
    superAdminEmail,
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const itemId = uuidv7();
    const create = {
      ...command(data.editionId, itemId),
      name: "Race stock",
      openingQuantity: 5,
      unitPricePaise: 0,
      photo: null,
    };
    expect(
      (await mutate(request, "kalakritiInventory.create", create)).error
    ).toBeUndefined();
    const commands = [movement(data, itemId, 4), movement(data, itemId, 4)];
    const results = await Promise.all(
      commands.map((args) => mutate(request, "kalakritiInventory.record", args))
    );
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(
      results.filter((result) => result.message?.includes("Insufficient stock"))
    ).toHaveLength(1);
    const winner = commands[results.findIndex((result) => !result.error)];
    expect(winner).toBeDefined();
    expect(
      (await mutate(request, "kalakritiInventory.record", winner!)).error
    ).toBeUndefined();
    expect(
      (
        await mutate(request, "kalakritiInventory.record", {
          ...winner,
          quantity: 2,
        })
      ).message
    ).toContain("already in use");
    expect(
      (
        await mutate(request, "kalakritiInventory.record", {
          ...command(data.editionId, itemId),
          type: "adjustment",
          quantity: 0,
          expectedQuantity: 5,
          volunteerMembershipId: null,
          competitionId: null,
          notes: "Stale stock count",
        })
      ).message
    ).toContain("Stock has changed");
    const state = await fixture<State>("state");
    expect(state.items[0]?.quantity).toBe(1);
    expect(state.transactions).toHaveLength(2);
    expect(state.transactions.reduce((sum, row) => sum + row.quantity, 0)).toBe(
      1
    );
  });

  test("keeps all six Scan tabs inside the modal on desktop and mobile", async ({
    page,
    superAdminEmail,
    volunteerEmail,
  }) => {
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    await page.setViewportSize({ width: 2249, height: 1350 });
    await new KalakritiInventoryPage(page).goto(data.year);
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Scan", exact: true });
    await expect(dialog.getByRole("tab")).toHaveCount(6);
    for (const viewport of [
      { width: 2249, height: 1350 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () => {
          const bar = await dialog.getByRole("tablist").boundingBox();
          const panel = await dialog.getByRole("tabpanel").boundingBox();
          if (!bar || !panel || panel.y < bar.y + bar.height) return false;
          for (const tab of await dialog.getByRole("tab").all()) {
            const box = await tab.boundingBox();
            if (
              !box ||
              box.x < bar.x ||
              box.y < bar.y ||
              box.x + box.width > bar.x + bar.width + 1 ||
              box.y + box.height > bar.y + bar.height + 1
            )
              return false;
          }
          return true;
        })
        .toBe(true);
      await page.screenshot({
        path: `/tmp/kalakriti-scan-tabs-${viewport.width}.png`,
      });
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  });

  test("enforces logistics access, reactive revocation, and archived read-only history", async ({
    browser,
    baseURL,
    page,
    request,
    superAdminEmail,
    volunteerEmail,
    kalakritiActors,
  }) => {
    test.slow();
    const data = await fixture<Fixture>(
      "setup",
      superAdminEmail,
      volunteerEmail
    );
    const itemId = uuidv7();
    expect(
      (
        await mutate(request, "kalakritiInventory.create", {
          ...command(data.editionId, itemId),
          name: "Private inventory",
          openingQuantity: 0,
          unitPricePaise: 0,
          photo: null,
        })
      ).error
    ).toBeUndefined();
    const leadContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.categoryLead.storageState,
    });
    const deniedContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.liaison.storageState,
    });
    try {
      const leadPage = await leadContext.newPage();
      await new KalakritiInventoryPage(leadPage).goto(data.year);
      await expect(leadPage.getByRole("table")).toContainText(
        "Private inventory"
      );
      const deniedPage = await deniedContext.newPage();
      await deniedPage.goto(`/kalakriti/${data.year}/inventory`);
      await expect(
        deniedPage.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
      expect(
        (
          await mutate(
            deniedContext.request,
            "kalakritiInventory.record",
            movement(data, itemId, 1)
          )
        ).message
      ).toContain("Unauthorized");
      await fixture("revoke");
      await expect(
        leadPage.getByText("Private inventory", { exact: true })
      ).toHaveCount(0);
      expect(
        (
          await mutate(
            leadContext.request,
            "kalakritiInventory.record",
            movement(data, itemId, 1)
          )
        ).message
      ).toContain("Unauthorized");
      await fixture("archive");
      await new KalakritiInventoryPage(page).goto(data.year);
      await expect(page.getByRole("table")).toContainText("Private inventory");
      await expect(
        page.getByRole("button", { name: "Add item", exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Dispatch", exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Scan", exact: true })
      ).toHaveCount(0);
      expect(
        (
          await mutate(
            request,
            "kalakritiInventory.record",
            movement(data, itemId, 1)
          )
        ).message
      ).toContain("archived");
      expect(
        (await request.get(`/api/kalakriti/${data.year}/inventory`)).status()
      ).toBe(404);
    } finally {
      await leadContext.close();
      await deniedContext.close();
    }
  });
});
