import { strFromU8, unzipSync } from "fflate";
import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;

test.describe("Kalakriti Registration Release authorization", () => {
  test.describe.configure({ mode: "serial" });

  test("enforces the Edition role matrix on direct URLs", async ({
    baseURL,
    browser,
    kalakritiActors,
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti release role matrix"
    );
    test.slow();

    await page.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: `Kalakriti ${YEAR}` })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Edition" })
    ).toBeVisible();

    const cases = [
      {
        actor: kalakritiActors.editionAdmin,
        expectedText: "Volunteer assignments",
        path: `/kalakriti/${YEAR}`,
      },
      {
        actor: kalakritiActors.volunteerCoordinator,
        expectedText: "Volunteer assignments",
        path: `/kalakriti/${YEAR}`,
      },
      {
        actor: kalakritiActors.overallEventsLead,
        expectedText: "Performing Arts",
        path: `/kalakriti/${YEAR}/competitions`,
      },
      {
        actor: kalakritiActors.categoryLead,
        expectedText: "Performing Arts",
        path: `/kalakriti/${YEAR}/competitions`,
      },
      {
        actor: kalakritiActors.guardian,
        excludedText: "Outside Student",
        expectedText: "Assigned Student",
        path: `/kalakriti/${YEAR}/students`,
      },
      {
        actor: kalakritiActors.liaison,
        excludedText: "Outside Student",
        expectedText: "Assigned Student",
        path: `/kalakriti/${YEAR}/students`,
      },
    ] as const;

    for (const roleCase of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: Sequential contexts avoid overloading the shared Zero test server.
      const context = await browser.newContext({
        baseURL,
        storageState: roleCase.actor.storageState,
      });
      const rolePage = await context.newPage();
      try {
        await rolePage.goto(roleCase.path);
        await waitForZeroReady(rolePage);
        await expect(
          rolePage.getByRole("heading", { name: `Kalakriti ${YEAR}` })
        ).toBeVisible();
        await expect(
          rolePage.getByText(roleCase.expectedText, { exact: true }).first()
        ).toBeVisible();
        if ("excludedText" in roleCase) {
          await expect(
            rolePage.getByText(roleCase.excludedText, { exact: true })
          ).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    }

    const categoryLeadCenterContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.categoryLead.storageState,
    });
    const categoryLeadCenterPage = await categoryLeadCenterContext.newPage();
    try {
      await categoryLeadCenterPage.goto(`/kalakriti/${YEAR}/centers`);
      await waitForZeroReady(categoryLeadCenterPage);
      await expect(
        categoryLeadCenterPage.getByRole("heading", { name: "Centers" })
      ).toBeVisible();
      await expect(
        categoryLeadCenterPage.getByText("Assigned Center", { exact: true })
      ).toHaveCount(0);
      await expect(
        categoryLeadCenterPage.getByText("Outside Center", { exact: true })
      ).toHaveCount(0);
    } finally {
      await categoryLeadCenterContext.close();
    }

    const unrelatedContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.unrelatedVolunteer.storageState,
    });
    const unrelatedPage = await unrelatedContext.newPage();
    try {
      await unrelatedPage.goto(`/kalakriti/${YEAR}`);
      await expect(
        unrelatedPage.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
      await unrelatedPage.goto("/kalakriti/2185");
      await expect(
        unrelatedPage.getByRole("heading", { name: "Kalakriti 2185" })
      ).toBeVisible();
    } finally {
      await unrelatedContext.close();
    }
  });

  test("keeps scoped exports private and rejects direct API bypasses", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti export privacy matrix"
    );

    const guardianContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.guardian.storageState,
    });
    const unrelatedContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.unrelatedVolunteer.storageState,
    });
    try {
      const response = await guardianContext.request.get(
        `/api/kalakriti/${YEAR}/registration-export`
      );
      expect(response.status()).toBe(200);
      const files = unzipSync(new Uint8Array(await response.body()));
      const students = strFromU8(files[`kalakriti-${YEAR}-students.csv`]!);
      const entries = strFromU8(
        files[`kalakriti-${YEAR}-competition-entries.csv`]!
      );
      expect(students).toContain("Assigned Student");
      expect(students).not.toContain("Outside Student");
      expect(entries).toContain("Assigned Student");
      expect(entries).not.toContain("Outside Student");

      expect(
        (
          await unrelatedContext.request.get(
            `/api/kalakriti/${YEAR}/registration-export`
          )
        ).status()
      ).toBe(404);
      expect(
        (
          await unrelatedContext.request.get(`/api/kalakriti/${YEAR}/audit`)
        ).status()
      ).toBe(404);
    } finally {
      await guardianContext.close();
      await unrelatedContext.close();
    }
  });

  test("denies dormant Guardian sessions and later-phase surfaces", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti dormant and later-phase boundary"
    );

    const anonymous = await browser.newContext({ baseURL });
    const editionAdmin = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.editionAdmin.storageState,
    });
    try {
      const signIn = await anonymous.request.post("/api/auth/sign-in/email", {
        data: {
          email: kalakritiActors.dormantExternalUser.email,
          password: kalakritiActors.dormantExternalUser.password,
        },
      });
      expect(signIn.ok()).toBe(false);
      expect(signIn.headers()["set-cookie"]).toBeUndefined();

      const page = await editionAdmin.newPage();
      await page.goto(`/kalakriti/${YEAR}`);
      await waitForZeroReady(page);
      await Promise.all(
        ["Event day", "Results", "Awards", "Inventory"].map((label) =>
          expect(page.getByRole("link", { name: label })).toHaveCount(0)
        )
      );
      await Promise.all(
        ["event-day", "results", "awards", "inventory"].map(async (path) => {
          const routePage = await editionAdmin.newPage();
          try {
            const apiResponse = await editionAdmin.request.get(
              `/api/kalakriti/${YEAR}/${path}`
            );
            await routePage.goto(`/kalakriti/${YEAR}/${path}`);
            await expect(
              routePage.getByRole("heading", { name: "Page not found" })
            ).toBeVisible();
            expect(apiResponse.status()).toBe(404);
          } finally {
            await routePage.close();
          }
        })
      );
    } finally {
      await anonymous.close();
      await editionAdmin.close();
    }
  });
});
