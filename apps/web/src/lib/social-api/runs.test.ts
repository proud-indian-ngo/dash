import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  insertSocialRun: mock(),
}));

import {
  handleSocialRunsWrite,
  type SocialRunsDeps,
  socialRunSchema,
} from "./runs";
import { stubAuthorize } from "./test-helpers";

const NOW = new Date("2026-10-11T05:00:00Z");
const body = {
  digestSent: false,
  dropped: 1,
  errors: [],
  eventsSeen: 12,
  finishedAt: "2026-10-11T10:31:05+05:30",
  planned: 3,
  recorded: 2,
  rendered: 2,
  skipped: ["recap evt-1: no photos"],
  startedAt: "2026-10-11T10:30:00+05:30",
  tick: "hourly",
};

const post = (payload: unknown) =>
  new Request("https://dash.proudindian.ngo/api/social/v1/runs", {
    body: JSON.stringify(payload),
    method: "POST",
  });

function createDeps(overrides: Partial<SocialRunsDeps> = {}) {
  const insertSocialRun = mock(async () => undefined);
  const deps: SocialRunsDeps = {
    authorize: stubAuthorize(),
    insertSocialRun,
    now: () => NOW,
    ...overrides,
  };
  return { deps, insertSocialRun };
}

describe("socialRunSchema", () => {
  it.each([
    { tick: "weekly" },
    { eventsSeen: -1 },
    { planned: 1.5 },
    { rendered: "2" },
    { digestSent: "yes" },
    { startedAt: "yesterday" },
    { finishedAt: "2026-10-11T10:29:00+05:30" },
    { skipped: [1] },
    { errors: "boom" },
    { extra: true },
    { errors: Array.from({ length: 1001 }, () => "e") },
    { skipped: ["x".repeat(10_001)] },
  ])("rejects %o", (change) => {
    expect(socialRunSchema.safeParse({ ...body, ...change }).success).toBe(
      false
    );
  });

  it("caps skipped and errors at 50 entries of 500 characters", () => {
    const long = Array.from(
      { length: 60 },
      (_, i) => `${i}:${"x".repeat(600)}`
    );
    const parsed = socialRunSchema.parse({
      ...body,
      errors: long,
      skipped: long,
    });
    for (const list of [parsed.errors, parsed.skipped]) {
      expect(list).toHaveLength(50);
      expect(list.every((entry) => entry.length === 500)).toBe(true);
      expect(list[0]?.startsWith("0:")).toBe(true);
    }
  });
});

describe("handleSocialRunsWrite", () => {
  it("stores the run with dates parsed and answers 204", async () => {
    const { deps, insertSocialRun } = createDeps();
    const response = await handleSocialRunsWrite(post(body), deps);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(deps.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      "social:write",
      "runs"
    );
    expect(insertSocialRun).toHaveBeenCalledWith(
      {
        ...body,
        finishedAt: new Date("2026-10-11T05:01:05Z"),
        startedAt: new Date("2026-10-11T05:00:00Z"),
      },
      NOW
    );
  });

  it("stores the capped lists, not the raw ones", async () => {
    const { deps, insertSocialRun } = createDeps();
    const errors = Array.from({ length: 51 }, () => "e".repeat(501));
    await handleSocialRunsWrite(post({ ...body, errors }), deps);
    const [stored] = insertSocialRun.mock.calls[0] as unknown as [
      { errors: string[] },
    ];
    expect(stored.errors).toHaveLength(50);
    expect(stored.errors[0]).toHaveLength(500);
  });

  it("answers 400 with issues for an invalid or missing body", async () => {
    const { deps, insertSocialRun } = createDeps();
    const invalid = await handleSocialRunsWrite(
      post({ ...body, tick: "weekly" }),
      deps
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: "Invalid run report",
      issues: [{ path: "tick" }],
    });
    const empty = await handleSocialRunsWrite(
      new Request("https://dash.proudindian.ngo/api/social/v1/runs", {
        body: "not json",
        method: "POST",
      }),
      deps
    );
    expect(empty.status).toBe(400);
    expect(insertSocialRun).not.toHaveBeenCalled();
  });

  it("answers 413 for a body over 64 KB without storing it", async () => {
    const { deps, insertSocialRun } = createDeps();
    const huge = {
      ...body,
      skipped: Array.from({ length: 900 }, () => "s".repeat(100)),
    };
    const response = await handleSocialRunsWrite(post(huge), deps);
    expect(response.status).toBe(413);
    expect(insertSocialRun).not.toHaveBeenCalled();
  });

  it.each([401, 403])("passes through the %i auth error", async (status) => {
    const { deps, insertSocialRun } = createDeps({
      authorize: stubAuthorize(status),
    });
    expect((await handleSocialRunsWrite(post(body), deps)).status).toBe(status);
    expect(insertSocialRun).not.toHaveBeenCalled();
  });

  it("answers 500 when storing fails", async () => {
    const { deps } = createDeps({
      insertSocialRun: mock(async () => {
        throw new Error("db down");
      }),
    });
    expect((await handleSocialRunsWrite(post(body), deps)).status).toBe(500);
  });
});
