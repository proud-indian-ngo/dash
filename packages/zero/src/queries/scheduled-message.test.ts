import { describe, expect, it } from "bun:test";

import { scheduledMessageQueries } from "./scheduled-message";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

const allowedContext = {
  permissions: ["messages.schedule"],
  role: "admin",
  userId: "scheduler-1",
};

describe("scheduled message query access", () => {
  it.each([
    [
      "volunteer",
      { permissions: [], role: "volunteer", userId: "volunteer-1" },
    ],
    [
      "external user",
      {
        permissions: ["messages.schedule"],
        role: "external_user",
        userId: "guardian-1",
      },
    ],
  ])("denies %s from all and byId", (_label, ctx) => {
    const all = scheduledMessageQueries.all.fn({
      args: undefined,
      ctx: ctx as never,
    });
    const byId = scheduledMessageQueries.byId.fn({
      args: { id: "message-1" },
      ctx: ctx as never,
    });

    expect(queryAst(all)).toContain('"value":"__never_match__"');
    expect(queryAst(byId)).toContain('"value":"__never_match__"');
  });

  it("allows messages.schedule holders to read all and byId", () => {
    const all = scheduledMessageQueries.all.fn({
      args: undefined,
      ctx: allowedContext,
    });
    const byId = scheduledMessageQueries.byId.fn({
      args: { id: "message-1" },
      ctx: allowedContext,
    });

    expect(queryAst(all)).not.toContain('"value":"__never_match__"');
    expect(queryAst(byId)).not.toContain('"value":"__never_match__"');
    expect(queryAst(byId)).toContain('"value":"message-1"');
  });
});
