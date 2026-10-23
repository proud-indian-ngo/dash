import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

let pollWhere: SQL | undefined;
let openPolls: { id: string }[] = [];
const enqueue = mock(async () => undefined);

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    _entry: unknown,
    run: () => Promise<unknown>
  ) => await run(),
}));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => ["events.edit"],
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));
mock.module("@pi-dash/db", () => ({
  db: {
    query: {
      team: { findFirst: async () => ({ whatsappGroupId: "group-1" }) },
      teamEvent: {
        findFirst: async () => ({
          cancelledAt: null,
          id: "event-1",
          postRsvpPoll: true,
          teamId: "team-1",
          whatsappGroupId: null,
        }),
      },
    },
    select: () => ({
      from: () => ({
        where: (predicate: SQL) => {
          pollWhere = predicate;
          return { limit: async () => openPolls };
        },
      }),
    }),
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
  }),
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { postEventRsvpPoll } = await import("./event-poll");
const post = () =>
  (postEventRsvpPoll as unknown as (input: unknown) => Promise<unknown>)({
    context: { headers: new Headers(), session: { user: { id: "lead" } } },
    data: { eventId: "event-1" },
  });

describe("postEventRsvpPoll", () => {
  beforeEach(() => {
    enqueue.mockClear();
    openPolls = [];
    pollWhere = undefined;
  });

  it("posts again when the only poll was closed, as after a restore", async () => {
    expect(await post()).toEqual({ type: "ok" });
    expect(enqueue).toHaveBeenCalledWith("send-single-rsvp-poll", {
      eventId: "event-1",
    });
    expect(new PgDialect().sqlToQuery(pollWhere as SQL).sql).toContain(
      '"closed_at" is null'
    );
  });

  it("refuses while a poll is open", async () => {
    openPolls = [{ id: "poll-1" }];
    expect(await post()).toEqual({ code: "poll_exists", type: "error" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
