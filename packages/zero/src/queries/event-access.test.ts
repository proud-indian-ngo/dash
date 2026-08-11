import { describe, expect, it } from "vitest";
import { eventImmichAlbumQueries, eventPhotoQueries } from "./event-photo";
import { eventUpdateQueries } from "./event-update";
import { teamEventQueries } from "./team-event";

const externalContext = {
  permissions: ["kalakriti.view"],
  role: "external_user",
  userId: "guardian-1",
};

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("generic event query access", () => {
  it("denies external-only users from public event queries", () => {
    const query = teamEventQueries.allAccessible.fn({
      args: undefined,
      ctx: externalContext,
    });

    expect(queryAst(query)).toContain(
      '"value":"00000000-0000-0000-0000-000000000000"'
    );
  });

  it("scopes update, photo, and album queries through an authorized event", () => {
    const args = { eventId: "event-1" };
    const queries = [
      eventUpdateQueries.approvedByEvent.fn({ args, ctx: externalContext }),
      eventUpdateQueries.byEvent.fn({ args, ctx: externalContext }),
      eventUpdateQueries.myPendingByEvent.fn({
        args,
        ctx: externalContext,
      }),
      eventPhotoQueries.approvedByEvent.fn({ args, ctx: externalContext }),
      eventPhotoQueries.byEvent.fn({ args, ctx: externalContext }),
      eventPhotoQueries.myPendingByEvent.fn({ args, ctx: externalContext }),
      eventImmichAlbumQueries.byEvent.fn({ args, ctx: externalContext }),
    ];

    for (const query of queries) {
      expect(queryAst(query)).toContain(
        '"value":"00000000-0000-0000-0000-000000000000"'
      );
    }
  });
});
