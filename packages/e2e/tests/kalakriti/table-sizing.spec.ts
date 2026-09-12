import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});
async function fixture(action: string, ...args: string[]) {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/kalakriti-station-subject.ts"
      ),
      action,
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as { year: number; divisionId: string };
}
function header(page: Page, name: string) {
  return page.getByRole("columnheader", { name: new RegExp(`\\b${name}\\b`) });
}
async function geometry(table: Locator) {
  return await table.evaluate((node) => {
    let viewport = node.parentElement!;
    while (
      viewport.parentElement &&
      !/auto|scroll/.test(getComputedStyle(viewport).overflowX)
    )
      viewport = viewport.parentElement;
    return {
      saved: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.includes("table_state"))
          .map((key) => {
            const value = JSON.parse(localStorage.getItem(key) ?? "{}");
            return [
              key,
              {
                columnSizing: value.columnSizing,
                columnOrder: value.columnOrder,
                columnPinning: value.columnPinning,
              },
            ];
          })
      ),
      table: node.getBoundingClientRect().width,
      tableStyle: (node as HTMLElement).style.width,
      viewport: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      scrollLeft: viewport.scrollLeft,
      headers: Array.from(node.querySelectorAll("th")).map((cell) => ({
        name: cell.textContent?.trim(),
        width: cell.getBoundingClientRect().width,
        inlineWidth: cell.style.width,
        left: cell.getBoundingClientRect().left,
        position: getComputedStyle(cell).position,
        cssLeft: getComputedStyle(cell).left,
        pinned: cell.getAttribute("data-pinned"),
      })),
    };
  });
}
async function expectAllocation(
  table: Locator,
  preferred: ReadonlyMap<string, number>
) {
  await expect
    .poll(
      async () => {
        const current = await geometry(table);
        const filler = current.headers.filter((item) => !item.pinned).at(-1);
        const total = current.headers.reduce(
          (sum, item) => sum + preferred.get(item.name ?? "")!,
          0
        );
        const slack = Math.max(0, current.viewport - total);
        return (
          current.headers.every(
            (item) =>
              Math.abs(
                item.width -
                  (preferred.get(item.name ?? "")! +
                    (item === filler ? slack : 0))
              ) <= 1
          ) && Math.abs(current.table - Math.max(total, current.viewport)) <= 1
        );
      },
      {
        message:
          "Only the last visible unpinned column absorbs spare viewport width",
      }
    )
    .toBe(true);
  return await geometry(table);
}
async function toggleColumn(
  page: Page,
  anchor: Locator,
  anchorName: string,
  name: string
) {
  await anchor.getByRole("button", { name: anchorName, exact: true }).click();
  await page.getByRole("menuitem", { name: "Columns", exact: true }).hover();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}
async function width(column: Locator) {
  return await column.evaluate((node) => node.getBoundingClientRect().width);
}
async function dragResize(page: Page, column: Locator, delta: number) {
  const handle = column.getByRole("separator", {
    name: "Resize column",
    exact: true,
  });
  await handle.hover({ position: { x: 4, y: 8 } });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + 8;
  console.log(
    "[resize-hit]",
    await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          x,
          y,
          tag: hit?.tagName,
          role: hit?.getAttribute("role"),
          column: hit?.closest("th")?.textContent,
        };
      },
      { x, y }
    )
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y, { steps: 12 });
  const during = await geometry(page.getByRole("table"));
  await page.mouse.up();
  return during;
}

test("shared table DOM sizing, drag, scroll and persisted column controls", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Isolated scope fixture requires the serialized lane"
  );
  test.slow();
  page.setDefaultTimeout(10_000);
  const data = await fixture("setup-scopes", superAdminEmail);
  try {
    for (const [surface, pathname, name, neighbor, hidden] of [
      [
        "Entries",
        `/kalakriti/${data.year}/entries/${data.divisionId}`,
        "Center",
        "Present",
        "Participation",
      ],
      ["Food", `/kalakriti/${data.year}/food`, "Name", "Person ID", "Role"],
    ] as const) {
      await test.step(surface, async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(pathname);
        await waitForZeroReady(page);
        const table = page.getByRole("table");
        const column = header(page, name);
        await expect(
          column.getByRole("separator", { name: "Resize column", exact: true })
        ).toBeVisible();
        const before = await geometry(table);
        const preferred = new Map(
          before.headers.map((item) => [item.name ?? "", item.width])
        );
        const initialWidth = await width(column);
        const during = await dragResize(page, column, 120);
        await expect.soft
          .poll(() => width(column), {
            timeout: 2_000,
            message: `${surface}: actual header grows after 120px resize drag`,
          })
          .toBeCloseTo(initialWidth + 120, 0);
        const after = await geometry(table);
        console.log(
          `[table-sizing] ${surface} ${JSON.stringify({ before, during, after })}`
        );
        await testInfo.attach(`${surface}-resize-geometry`, {
          body: JSON.stringify({ before, during, after }, null, 2),
          contentType: "application/json",
        });
        const resizedWidth = initialWidth + 120;
        preferred.set(name, resizedWidth);
        const search = page.getByPlaceholder(
          surface === "Food" ? "Search people..." : "Search Entries..."
        );
        await search.fill(
          surface === "Food" ? "Union Guardian" : "Activity Student"
        );
        await expect.soft
          .poll(() => width(column), {
            timeout: 2_000,
            message: `${surface}: unrelated search rerender preserves resized width`,
          })
          .toBeCloseTo(resizedWidth, 0);
        await search.fill("");
        await page.reload();
        await waitForZeroReady(page);
        await expect.soft
          .poll(() => width(column), {
            timeout: 2_000,
            message: `${surface}: resized DOM width persists after reload`,
          })
          .toBeCloseTo(resizedWidth, 0);
        await page.setViewportSize({ width: 900, height: 800 });
        await expect.soft
          .poll(() => width(column), {
            timeout: 2_000,
            message: `${surface}: viewport shrinking preserves explicit column width`,
          })
          .toBeCloseTo(resizedWidth, 0);
        const drag = await column
          .getByRole("button", { name: "Drag to reorder", exact: true })
          .boundingBox();
        const destination = await header(page, neighbor).boundingBox();
        const indexBefore = await column.evaluate(
          (node) => (node as HTMLTableCellElement).cellIndex
        );
        await page.mouse.move(
          drag!.x + drag!.width / 2,
          drag!.y + drag!.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
          destination!.x + destination!.width * 0.75,
          destination!.y + destination!.height / 2,
          { steps: 16 }
        );
        await page.mouse.up();
        await expect.soft
          .poll(
            () =>
              column.evaluate(
                (node) => (node as HTMLTableCellElement).cellIndex
              ),
            {
              timeout: 2_000,
              message: `${surface}: actual drag handle changes DOM column order`,
            }
          )
          .not.toBe(indexBefore);
        await column.getByRole("button", { name, exact: true }).click();
        await page
          .getByRole("menuitem", { name: "Pin to left", exact: true })
          .click();
        await expect(
          column.getByRole("button", {
            name: `Unpin ${name} column`,
            exact: true,
          })
        ).toBeVisible();
        await column.getByRole("button", { name, exact: true }).click();
        await page
          .getByRole("menuitem", { name: "Columns", exact: true })
          .hover();
        await page
          .getByRole("menuitemcheckbox", { name: hidden, exact: true })
          .click();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(header(page, hidden)).toHaveCount(0);
        const left = await column.evaluate(
          (node) => node.getBoundingClientRect().left
        );
        await table.evaluate((node) => {
          let viewport = node.parentElement!;
          while (
            viewport.parentElement &&
            !/auto|scroll/.test(getComputedStyle(viewport).overflowX)
          )
            viewport = viewport.parentElement;
          viewport.scrollLeft = viewport.scrollWidth;
        });
        await expect
          .poll(async () => (await geometry(table)).scrollLeft)
          .toBeGreaterThan(0);
        const edge = await geometry(table);
        console.log(`[table-pinned] ${surface} ${JSON.stringify(edge)}`);
        expect
          .soft(
            Math.abs(edge.scrollLeft + edge.viewport - edge.scrollWidth),
            `${surface}: right scroll edge is reachable`
          )
          .toBeLessThanOrEqual(2);
        expect
          .soft(
            await column.evaluate((node) => node.getBoundingClientRect().left),
            `${surface}: pinned column remains at left edge`
          )
          .toBeCloseTo(left, 0);
        await page.reload();
        await waitForZeroReady(page);
        await expect(header(page, hidden)).toHaveCount(0);
        await expect(
          column.getByRole("button", {
            name: `Unpin ${name} column`,
            exact: true,
          })
        ).toBeVisible();
        await expect.soft
          .poll(() => width(column), { timeout: 2_000 })
          .toBeCloseTo(resizedWidth, 0);
        await page.setViewportSize({ width: 1800, height: 1000 });
        if (surface === "Entries") {
          for (const extraHidden of ["Student IDs", "Age Category", "Venue"]) {
            await column.getByRole("button", { name, exact: true }).click();
            await page
              .getByRole("menuitem", { name: "Columns", exact: true })
              .hover();
            await page
              .getByRole("menuitemcheckbox", { name: extraHidden, exact: true })
              .click();
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");
            await expect(header(page, extraHidden)).toHaveCount(0);
          }
        }
        await header(page, neighbor)
          .getByRole("button", { name: neighbor, exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Pin to left", exact: true })
          .click();
        await expect(
          header(page, neighbor).getByRole("button", {
            name: `Unpin ${neighbor} column`,
            exact: true,
          })
        ).toBeVisible();
        let underfilled = await expectAllocation(table, preferred);
        const ordinary = underfilled.headers.find((item) => !item.pinned)!;
        const absorbing = underfilled.headers
          .filter((item) => !item.pinned)
          .at(-1)!;
        expect(ordinary.name).not.toBe(absorbing.name);
        await dragResize(page, header(page, ordinary.name!), 40);
        preferred.set(ordinary.name!, ordinary.width + 40);
        const adjusted = await expectAllocation(table, preferred);
        expect(
          adjusted.headers.find((item) => item.name === absorbing.name)!.width
        ).toBeCloseTo(absorbing.width - 40, 0);
        for (const unaffected of underfilled.headers.filter(
          (item) => item.name !== ordinary.name && item.name !== absorbing.name
        )) {
          expect(
            adjusted.headers.find((item) => item.name === unaffected.name)!
              .width
          ).toBeCloseTo(unaffected.width, 0);
        }
        underfilled = adjusted;
        const savedPreferences = Object.fromEntries(
          Object.entries(underfilled.saved).map(([key, value]) => [
            key,
            value.columnSizing,
          ])
        );
        console.log(
          `[table-underfilled] ${surface} ${JSON.stringify(underfilled)}`
        );
        await testInfo.attach(`${surface}-underfilled-geometry`, {
          body: JSON.stringify(underfilled, null, 2),
          contentType: "application/json",
        });
        const firstPinned = await column.boundingBox();
        const secondPinned = await header(page, neighbor).boundingBox();
        expect
          .soft(
            secondPinned!.x - firstPinned!.x - firstPinned!.width,
            `${surface}: underfilled pinned columns must not overlap`
          )
          .toBeCloseTo(0, 0);
        const unpinned = underfilled.headers.filter((item) => !item.pinned);
        const oldFiller = unpinned.at(-1)!.name!;
        const reorderHandle = header(page, oldFiller).getByRole("button", {
          name: "Drag to reorder",
          exact: true,
        });
        await reorderHandle.hover();
        const from = await reorderHandle.boundingBox();
        const to = await header(page, unpinned[0]!.name!).boundingBox();
        await page.mouse.move(
          from!.x + from!.width / 2,
          from!.y + from!.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(to!.x + to!.width / 4, to!.y + to!.height / 2, {
          steps: 16,
        });
        await page.mouse.up();
        await expect
          .poll(
            async () =>
              (await geometry(table)).headers
                .filter((item) => !item.pinned)
                .at(-1)?.name
          )
          .not.toBe(oldFiller);
        const reordered = await expectAllocation(table, preferred);
        const firstFiller = reordered.headers
          .filter((item) => !item.pinned)
          .at(-1)!.name!;
        await toggleColumn(page, column, name, firstFiller);
        await expect(header(page, firstFiller)).toHaveCount(0);
        const afterHide = await expectAllocation(table, preferred);
        const nextFiller = afterHide.headers
          .filter((item) => !item.pinned)
          .at(-1)!.name!;
        expect(nextFiller).not.toBe(firstFiller);
        await header(page, nextFiller)
          .getByRole("button", { name: nextFiller, exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Pin to right", exact: true })
          .click();
        await expectAllocation(table, preferred);
        await page.setViewportSize({ width: 1000, height: 900 });
        await expectAllocation(table, preferred);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await expectAllocation(table, preferred);
        await page.reload();
        await waitForZeroReady(page);
        const reloadedFill = await expectAllocation(table, preferred);
        expect(
          Object.fromEntries(
            Object.entries(reloadedFill.saved).map(([key, value]) => [
              key,
              value.columnSizing,
            ])
          )
        ).toEqual(savedPreferences);
        const activeFiller = reloadedFill.headers
          .filter((item) => !item.pinned)
          .at(-1)!;
        const floorDrag = await dragResize(
          page,
          header(page, activeFiller.name!),
          -80
        );
        expect(
          floorDrag.headers.find((item) => item.name === activeFiller.name)!
            .width,
          `${surface}: filler remains at remaining-space floor during shrink`
        ).toBeCloseTo(activeFiller.width, 0);
        const afterFloorDrag = await expectAllocation(table, preferred);
        expect(
          Object.fromEntries(
            Object.entries(afterFloorDrag.saved).map(([key, value]) => [
              key,
              value.columnSizing,
            ])
          ),
          `${surface}: no-op floor shrink does not persist derived fill`
        ).toEqual(savedPreferences);
        await dragResize(page, header(page, activeFiller.name!), 80);
        preferred.set(activeFiller.name!, activeFiller.width + 80);
        const resizedFiller = await expectAllocation(table, preferred);
        expect(resizedFiller.scrollWidth).toBeGreaterThan(
          resizedFiller.viewport
        );
        for (const unchanged of reloadedFill.headers.filter(
          (item) => item.name !== activeFiller.name
        )) {
          expect(
            resizedFiller.headers.find((item) => item.name === unchanged.name)!
              .width
          ).toBeCloseTo(unchanged.width, 0);
        }
        await page.reload();
        await waitForZeroReady(page);
        await expectAllocation(table, preferred);
        const backToFloor = await dragResize(
          page,
          header(page, activeFiller.name!),
          -160
        );
        expect(
          backToFloor.headers.find((item) => item.name === activeFiller.name)!
            .width,
          `${surface}: grown filler clamps to remaining space during shrink`
        ).toBeCloseTo(activeFiller.width, 0);
        preferred.set(activeFiller.name!, activeFiller.width);
        await expectAllocation(table, preferred);
        await page.reload();
        await waitForZeroReady(page);
        await expectAllocation(table, preferred);
        await testInfo.attach(`${surface}-final-geometry`, {
          body: JSON.stringify(await geometry(table), null, 2),
          contentType: "application/json",
        });
      });
    }
  } finally {
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});
