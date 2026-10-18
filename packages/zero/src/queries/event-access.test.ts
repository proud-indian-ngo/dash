import { describe, expect, it } from "bun:test";

import { queries as registeredQueries } from "../queries";
import { eventInterestQueries } from "./event-interest";
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
  it("keeps interest ownership and restricted Event authorization", () => {
    for (const permissions of [["events.view_all"], ["events.view_own"], []]) {
      const ast = queryAst(
        eventInterestQueries.byCurrentUser.fn({
          args: undefined,
          ctx: { userId: "reader", role: "volunteer", permissions },
        })
      );
      expect(ast).toContain('"name":"userId"');
      expect(ast).toContain('"value":"reader"');
      expect(ast).toContain('"alias":"event"');
      if (permissions.includes("events.view_own"))
        expect(ast).toContain('"name":"isPublic"');
      if (permissions.length === 0)
        expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
    }
  });

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
      eventUpdateQueries.myPendingByEvent.fn({
        args,
        ctx: externalContext,
      }),
      eventPhotoQueries.approvedByEvent.fn({ args, ctx: externalContext }),
      eventPhotoQueries.myPendingByEvent.fn({ args, ctx: externalContext }),
      eventImmichAlbumQueries.byEvent.fn({ args, ctx: externalContext }),
    ];

    for (const query of queries) {
      expect(queryAst(query)).toContain(
        '"value":"00000000-0000-0000-0000-000000000000"'
      );
    }
  });

  it("does not register broad all-status event content queries", () => {
    expect(Object.keys(eventUpdateQueries)).not.toContain("byEvent");
    expect(Object.keys(eventPhotoQueries)).not.toContain("byEvent");
    expect(Object.keys(registeredQueries.eventUpdate)).not.toContain("byEvent");
    expect(Object.keys(registeredQueries.eventPhoto)).not.toContain("byEvent");
  });

  it("retains approved, own-pending, and manager-pending scopes", () => {
    const args = { eventId: "event-1" };
    const viewer = {
      permissions: ["events.view_own"],
      role: "volunteer",
      userId: "reader",
    };

    const approvedUpdate = queryAst(
      eventUpdateQueries.approvedByEvent.fn({ args, ctx: viewer })
    );
    const ownPendingUpdate = queryAst(
      eventUpdateQueries.myPendingByEvent.fn({ args, ctx: viewer })
    );
    const managerPendingUpdate = queryAst(
      eventUpdateQueries.pendingByEvent.fn({ args, ctx: viewer })
    );
    const approvedPhoto = queryAst(
      eventPhotoQueries.approvedByEvent.fn({ args, ctx: viewer })
    );
    const ownPendingPhoto = queryAst(
      eventPhotoQueries.myPendingByEvent.fn({ args, ctx: viewer })
    );
    const managerPendingPhoto = queryAst(
      eventPhotoQueries.pendingByEvent.fn({ args, ctx: viewer })
    );

    expect(approvedUpdate).toContain('"value":"approved"');
    expect(ownPendingUpdate).toContain('"value":"pending"');
    expect(ownPendingUpdate).toContain('"value":"reader"');
    expect(managerPendingUpdate).toContain('"value":"lead"');
    expect(approvedPhoto).toContain('"value":"approved"');
    expect(ownPendingPhoto).toContain('"value":"pending"');
    expect(ownPendingPhoto).toContain('"value":"reader"');
    expect(managerPendingPhoto).toContain('"value":"lead"');
  });
});
