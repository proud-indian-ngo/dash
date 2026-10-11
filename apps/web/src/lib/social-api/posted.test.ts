import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  listSocialPosts: mock(),
  listSocialPostsInWindow: mock(),
  upsertSocialPost: mock(),
}));
mock.module("@/lib/audit", () => ({ runAuditedAction: mock() }));

import {
  handleSocialPostedRead,
  handleSocialPostedWrite,
  postedAuditTarget,
  postedRecordSchema,
  type SocialPostedDeps,
} from "./posted";
import { stubAuthorize, TEST_TOKEN } from "./test-helpers";

const EVENT_ID = "019a0000-0000-7000-8000-000000000001";
const NOW = new Date("2026-10-11T00:00:00Z");

const record = {
  bufferPostId: "buf_1",
  channel: "instagram",
  eventId: EVENT_ID,
  kind: "recap",
  scheduledFor: "2026-10-18T13:30:00Z",
  status: "queued",
};

const stored = {
  ...record,
  eventName: null,
  occurrenceDate: null,
  scheduledFor: new Date(record.scheduledFor),
};

function createDeps(overrides: Partial<SocialPostedDeps> = {}) {
  const upsertSocialPost = mock(async () => undefined);
  const listSocialPosts = mock(async () => [stored]);
  const listSocialPostsInWindow = mock(async () => [
    {
      ...stored,
      eventId: `${EVENT_ID}:2026-10-17`,
      eventName: "Spoken English Class",
      occurrenceDate: "2026-10-17",
    },
  ]);
  const runAuditedAction = mock(
    async (_options: unknown, execute: () => Promise<unknown>) => execute()
  );
  const deps = {
    authorize: stubAuthorize(),
    listSocialPosts,
    listSocialPostsInWindow,
    now: () => NOW,
    runAuditedAction,
    upsertSocialPost,
    ...overrides,
  } as unknown as SocialPostedDeps;
  return {
    deps,
    listSocialPosts,
    listSocialPostsInWindow,
    runAuditedAction,
    upsertSocialPost,
  };
}

const post = (body: unknown) =>
  new Request("https://dash.proudindian.ngo/api/social/v1/posted", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    method: "POST",
  });

describe("postedRecordSchema", () => {
  it("accepts the spec record", () => {
    expect(postedRecordSchema.safeParse(record).success).toBe(true);
  });

  it("accepts a virtual occurrence id", () => {
    expect(
      postedRecordSchema.safeParse({
        ...record,
        eventId: `${EVENT_ID}:2026-10-17`,
      }).success
    ).toBe(true);
  });

  it.each([
    { channel: "twitter" },
    { kind: "meme" },
    { status: "deleted" },
    { scheduledFor: "tomorrow" },
    { eventId: "" },
    { bufferPostId: "x".repeat(201) },
    { occurrenceDate: "2026-13-01" },
    { occurrenceDate: "18 Oct" },
    { eventName: "x".repeat(201) },
    { extra: true },
  ])("rejects %o", (change) => {
    expect(postedRecordSchema.safeParse({ ...record, ...change }).success).toBe(
      false
    );
  });
});

describe("handleSocialPostedWrite", () => {
  it("upserts the record under an audit entry for the token and answers 204", async () => {
    const { deps, runAuditedAction, upsertSocialPost } = createDeps();

    const response = await handleSocialPostedWrite(post(record), deps);

    expect(response.status).toBe(204);
    expect(upsertSocialPost).toHaveBeenCalledWith(
      {
        ...record,
        eventName: null,
        occurrenceDate: null,
        scheduledFor: new Date("2026-10-18T13:30:00Z"),
      },
      NOW
    );
    expect(runAuditedAction.mock.calls[0]?.[0]).toEqual({
      action: "social.posted.record",
      actor: {
        name: TEST_TOKEN.name,
        role: "social-api",
        userId: TEST_TOKEN.id,
      },
      metadata: { channel: "instagram", kind: "recap", status: "queued" },
      target: { id: EVENT_ID, type: "teamEvent" },
    });
  });

  it("stores occurrenceDate and eventName when given", async () => {
    const { deps, upsertSocialPost } = createDeps();
    const response = await handleSocialPostedWrite(
      post({
        ...record,
        eventName: "Spoken English Class",
        occurrenceDate: "2026-10-18",
      }),
      deps
    );
    expect(response.status).toBe(204);
    expect(upsertSocialPost).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Spoken English Class",
        occurrenceDate: "2026-10-18",
      }),
      NOW
    );
  });

  it("requires social:write", async () => {
    const authorize = stubAuthorize(403);
    const { deps, upsertSocialPost } = createDeps({ authorize });
    const response = await handleSocialPostedWrite(post(record), deps);
    expect(response.status).toBe(403);
    expect(authorize.mock.calls[0]?.[1]).toBe("social:write");
    expect(upsertSocialPost).not.toHaveBeenCalled();
  });

  it.each([["not json"], [{ ...record, status: "nope" }], [null]])(
    "returns 400 for an invalid body",
    async (body) => {
      const { deps, upsertSocialPost } = createDeps();
      const response = await handleSocialPostedWrite(post(body), deps);
      expect(response.status).toBe(400);
      expect(upsertSocialPost).not.toHaveBeenCalled();
    }
  );
});

describe("postedAuditTarget", () => {
  it("is a teamEvent only for a bare uuid", () => {
    expect(postedAuditTarget(EVENT_ID)).toEqual({
      id: EVENT_ID,
      type: "teamEvent",
    });
    expect(postedAuditTarget(`${EVENT_ID}:2026-10-17`)).toEqual({
      id: EVENT_ID,
      type: "teamEventSeries",
    });
    expect(postedAuditTarget("legacy-42")).toEqual({ type: "socialPost" });
  });
});

describe("handleSocialPostedRead", () => {
  it("lists records for the event with ISO times", async () => {
    const authorize = stubAuthorize();
    const { deps, listSocialPosts } = createDeps({ authorize });
    const response = await handleSocialPostedRead(
      new Request(
        `https://dash.proudindian.ngo/api/social/v1/posted?eventId=${EVENT_ID}`
      ),
      deps
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      posted: [
        {
          ...record,
          eventName: null,
          occurrenceDate: null,
          scheduledFor: "2026-10-18T13:30:00.000Z",
        },
      ],
    });
    expect(listSocialPosts).toHaveBeenCalledWith(EVENT_ID);
    expect(authorize.mock.calls[0]?.[1]).toEqual([
      "social:write",
      "events:read",
    ]);
  });

  it("lists records for a virtual occurrence id", async () => {
    const { deps, listSocialPosts } = createDeps();
    const eventId = `${EVENT_ID}:2026-10-17`;
    const response = await handleSocialPostedRead(
      new Request(
        `https://dash.proudindian.ngo/api/social/v1/posted?eventId=${encodeURIComponent(eventId)}`
      ),
      deps
    );
    expect(response.status).toBe(200);
    expect(listSocialPosts).toHaveBeenCalledWith(eventId);
  });

  it("lists records in an occurrence-date window", async () => {
    const authorize = stubAuthorize();
    const { deps, listSocialPosts, listSocialPostsInWindow } = createDeps({
      authorize,
    });
    const response = await handleSocialPostedRead(
      new Request(
        "https://dash.proudindian.ngo/api/social/v1/posted?from=2026-10-01&to=2026-10-31"
      ),
      deps
    );
    expect(response.status).toBe(200);
    expect(listSocialPostsInWindow).toHaveBeenCalledWith(
      "2026-10-01",
      "2026-10-31"
    );
    expect(listSocialPosts).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      posted: [
        {
          ...record,
          eventId: `${EVENT_ID}:2026-10-17`,
          eventName: "Spoken English Class",
          occurrenceDate: "2026-10-17",
          scheduledFor: "2026-10-18T13:30:00.000Z",
        },
      ],
    });
    expect(authorize.mock.calls[0]?.[1]).toEqual([
      "social:write",
      "events:read",
    ]);
  });

  it.each([
    ["", "eventId or from and to is required"],
    ["?eventId=", "eventId must not be empty"],
    [`?eventId=${EVENT_ID}&from=2026-10-01&to=2026-10-31`, "not both"],
    ["?from=2026-10-01", "to must be a date"],
    ["?to=2026-10-01", "from must be a date"],
    ["?from=2026-13-01&to=2026-12-31", "from must be a date"],
    ["?from=2026-10-05&to=2026-10-04", "to must not be before from"],
    ["?from=2026-01-01&to=2026-05-01", "at most 120 days"],
  ])("returns 400 for query %p", async (query, message) => {
    const { deps, listSocialPosts, listSocialPostsInWindow } = createDeps();
    const response = await handleSocialPostedRead(
      new Request(`https://dash.proudindian.ngo/api/social/v1/posted${query}`),
      deps
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(message);
    expect(listSocialPosts).not.toHaveBeenCalled();
    expect(listSocialPostsInWindow).not.toHaveBeenCalled();
  });
});
