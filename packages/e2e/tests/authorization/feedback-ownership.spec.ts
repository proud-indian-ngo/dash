// @e2e-areas events
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { request } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { pushMutation } from "../../helpers/zero-mutate";
import type { InspectorWindow } from "../../helpers/zero-performance";

const execFileAsync = promisify(execFile);
async function fixture<T>(action: string, email?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/feedback-ownership.ts"),
      action,
      ...(email ? [email] : []),
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}
interface State {
  feedback: { id: string; content: string }[];
  submissions: { feedbackId: string }[];
}

test("event relations enforce privacy and feedback IDs cannot acquire another owner", async ({
  page,
  volunteerEmail,
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "volunteer",
    "Volunteer-only authorization test"
  );
  test.slow();
  const ids = await fixture<{
    series: string;
    privateChild: string;
    ownInterest: string;
    otherInterest: string;
    event: string;
    race: string;
    victimFeedback: string;
    raceFeedback: string;
  }>("setup", volunteerEmail);
  const admin = await request.newContext({
    baseURL,
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/super_admin.json"
    ),
  });
  const args = (eventId: string, feedbackId: string) => ({
    eventId,
    feedbackId,
    submissionId: uuidv7(),
    now: Date.now(),
    content: JSON.stringify([
      { type: "p", children: [{ text: "New feedback" }] },
    ]),
  });
  try {
    await test.step("nested query results react to reviewer and membership revocation", async () => {
      await page.goto(`/events/${ids.series}`);
      await waitForZeroReady(page);
      expect(
        await page.evaluate(
          (password) =>
            (window as InspectorWindow).__zero.inspector.authenticate(password),
          process.env.ZERO_ADMIN_PASSWORD ?? ""
        )
      ).toBe(true);
      const scope = () =>
        page.evaluate(async (seriesId) => {
          const queries = await (
            window as InspectorWindow
          ).__zero.inspector.client.queries();
          const query = queries.find(
            (item) =>
              item.name === "teamEvent.byId" &&
              item.got &&
              item.args?.some((arg) => arg.id === seriesId)
          );
          if (!query) return null;
          const rows = (
            await query.analyze({ joinPlans: false, syncedRows: true })
          ).syncedRows;
          return {
            events: (rows?.team_event ?? [])
              .map((row) => String(row.id))
              .sort(),
            interests: (rows?.event_interest ?? [])
              .map((row) => String(row.id))
              .sort(),
          };
        }, ids.series);
      const restricted = { events: [ids.series], interests: [ids.ownInterest] };
      await expect.poll(scope, { timeout: 30_000 }).toEqual(restricted);
      await fixture("grant-lead", volunteerEmail);
      await expect.poll(scope, { timeout: 30_000 }).toEqual({
        events: [ids.series, ids.privateChild].sort(),
        interests: [ids.ownInterest, ids.otherInterest].sort(),
      });
      await fixture("revoke-lead");
      await expect.poll(scope, { timeout: 30_000 }).toEqual(restricted);
      await testInfo.attach("nested-event-privacy.json", {
        body: JSON.stringify({
          denied: restricted,
          granted: { eventCount: 2, interestCount: 2 },
          revoked: restricted,
        }),
        contentType: "application/json",
      });
    });
    const before = await fixture<State>("state");
    expect(
      (
        await pushMutation(
          page.request,
          "eventFeedback.submit",
          args(ids.event, ids.victimFeedback)
        )
      ).error
    ).toBe("app");
    expect(
      (
        await pushMutation(
          page.request,
          "eventFeedback.update",
          args(ids.event, ids.victimFeedback)
        )
      ).error
    ).toBe("app");
    expect(await fixture("state")).toEqual(before);

    const malformedContents = [
      JSON.stringify([
        {
          type: "code_block",
          lang: { toString: null },
          children: [
            { type: "code_line", children: [{ text: "const x = 1;" }] },
          ],
        },
      ]),
      JSON.stringify([{ type: "p", children: [{ text: { bad: "shape" } }] }]),
      JSON.stringify([{ type: "p", children: { text: "Feedback" } }]),
      JSON.stringify([
        {
          type: "p",
          children: [
            {
              type: "mention",
              value: { bad: "shape" },
              children: [{ text: "" }],
            },
          ],
        },
      ]),
    ];
    await test.step("malformed feedback cannot be persisted", async () => {
      for (const content of malformedContents) {
        expect(
          (
            await pushMutation(page.request, "eventFeedback.submit", {
              ...args(ids.event, uuidv7()),
              content,
            })
          ).error
        ).toBe("app");
        expect(await fixture("state")).toEqual(before);
      }
    });

    // A new ID is still accepted after the refused hijack.
    const ownId = uuidv7();
    expect(
      await pushMutation(
        page.request,
        "eventFeedback.submit",
        args(ids.event, ownId)
      )
    ).toEqual({});
    await test.step("malformed edits leave the accepted response unchanged", async () => {
      const accepted = await fixture<State>("state");
      expect(accepted.feedback.find((row) => row.id === ownId)?.content).toBe(
        args(ids.event, ownId).content
      );
      for (const content of malformedContents) {
        expect(
          (
            await pushMutation(page.request, "eventFeedback.update", {
              eventId: ids.event,
              feedbackId: ownId,
              now: Date.now(),
              content,
            })
          ).error
        ).toBe("app");
        expect(await fixture("state")).toEqual(accepted);
      }
      await testInfo.attach("feedback-content-validation.json", {
        body: JSON.stringify({
          malformedSubmissionsRejected: malformedContents.length,
          malformedEditsRejected: malformedContents.length,
          acceptedContent: accepted.feedback.find((row) => row.id === ownId)
            ?.content,
        }),
        contentType: "application/json",
      });
    });
    const results = await Promise.all([
      pushMutation(
        page.request,
        "eventFeedback.submit",
        args(ids.race, ids.raceFeedback)
      ),
      pushMutation(
        admin,
        "eventFeedback.submit",
        args(ids.race, ids.raceFeedback)
      ),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.filter((result) => result.error === "app")).toHaveLength(1);
    const state = await fixture<State>("state");
    expect(
      state.submissions.filter((row) => row.feedbackId === ids.raceFeedback)
    ).toHaveLength(1);
    expect(
      state.submissions.filter((row) => row.feedbackId === ids.victimFeedback)
    ).toHaveLength(1);
    expect(
      state.feedback.find((row) => row.id === ids.victimFeedback)?.content
    ).toBe("Victim feedback");
    await testInfo.attach("feedback-ownership.json", {
      body: JSON.stringify({
        duplicateRejected: true,
        concurrentWinners: 1,
        ownershipCounts: state.submissions.length,
      }),
      contentType: "application/json",
    });
  } finally {
    await admin.dispose();
    await fixture("cleanup");
  }
});
