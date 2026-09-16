import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({ requireSession: mock() }));
mock.module("@/lib/server/kalakriti-edition-access", () => ({
  resolveKalakritiEditionAccess: mock(),
}));
mock.module("@/lib/server/kalakriti-id-card-data", () => ({
  getKalakritiIdCardData: mock(),
}));

import {
  handleKalakritiIdCards,
  type IdCardExportDependencies,
} from "./id-cards";

function dependencies(
  admin = true,
  editionAdmin = false
): IdCardExportDependencies {
  return {
    getSession: mock(async () => ({
      session: { user: { id: "user-1", role: "volunteer" } },
    })) as unknown as IdCardExportDependencies["getSession"],
    resolveAccess: mock(
      async (): ReturnType<IdCardExportDependencies["resolveAccess"]> => ({
        isGlobalAdmin: admin,
        edition: {
          id: "edition-1",
          year: 2027,
          name: "Kalakriti",
          ageCutoffDate: "2027-01-01",
          eventDate: "2027-01-01",
          lifecycle: "live",
          plannedRegistrationCloseAt: 0,
          teamEventId: "event-1",
          timezone: "Asia/Kolkata",
        },
        membership: {
          id: "member-1",
          kind: "volunteer",
          assignments: [],
          responsibilities: editionAdmin ? ["edition_admin"] : ["venue_member"],
        },
      })
    ),
    getPeople: mock(
      async (): ReturnType<IdCardExportDependencies["getPeople"]> => [
        {
          id: "01900000-0000-7000-8000-000000000001",
          type: "guest",
          name: "Guest",
        },
      ]
    ),
    generatePdf: mock(async () => Buffer.from("%PDF-1.3\n")),
    generateBlankPdf: mock(async () => Buffer.from("%PDF-1.3\n")),
  };
}
const request = () =>
  new Request("http://localhost/api/kalakriti/2027/id-cards");

describe("ID card download authorization", () => {
  it("downloads blank pages without querying the roster", async () => {
    const deps = dependencies();
    const response = await handleKalakritiIdCards(
      new Request(
        `${request().url}?mode=blank&volunteerPages=1&guestPages=2&judgePages=1`
      ),
      "2027",
      deps
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "blank-id-cards.pdf"
    );
    expect(deps.generateBlankPdf).toHaveBeenCalledWith({
      volunteerPages: 1,
      guestPages: 2,
      judgePages: 1,
    });
    expect(deps.getPeople).not.toHaveBeenCalled();
  });
  it("rejects empty, fractional, negative and excessive blank page requests", async () => {
    for (const count of ["0", "0.5", "-1", "101", "bad"]) {
      const deps = dependencies();
      expect(
        (
          await handleKalakritiIdCards(
            new Request(`${request().url}?mode=blank&volunteerPages=${count}`),
            "2027",
            deps
          )
        ).status
      ).toBe(400);
      expect(deps.generateBlankPdf).not.toHaveBeenCalled();
    }
  });
  it("denies non-admin blank downloads before rendering", async () => {
    const deps = dependencies(false);
    expect(
      (
        await handleKalakritiIdCards(
          new Request(`${request().url}?mode=blank&guestPages=1`),
          "2027",
          deps
        )
      ).status
    ).toBe(403);
    expect(deps.generateBlankPdf).not.toHaveBeenCalled();
  });
  it("rejects invalid years before resolving the session", async () => {
    const deps = dependencies();
    expect((await handleKalakritiIdCards(request(), "bad", deps)).status).toBe(
      400
    );
    expect(deps.getSession).not.toHaveBeenCalled();
  });
  it("returns unauthenticated without loading roster data", async () => {
    const deps = dependencies();
    deps.getSession = mock(async () => ({
      error: new Response(null, { status: 401 }),
    }));
    expect((await handleKalakritiIdCards(request(), "2027", deps)).status).toBe(
      401
    );
    expect(deps.getPeople).not.toHaveBeenCalled();
  });
  it("denies other edition roles before loading people", async () => {
    const deps = dependencies(false);
    expect((await handleKalakritiIdCards(request(), "2027", deps)).status).toBe(
      403
    );
    expect(deps.getPeople).not.toHaveBeenCalled();
    expect(deps.generatePdf).not.toHaveBeenCalled();
  });
  it("fails closed for another inaccessible edition", async () => {
    const deps = dependencies();
    deps.resolveAccess = mock(async () => null);
    expect((await handleKalakritiIdCards(request(), "2028", deps)).status).toBe(
      404
    );
    expect(deps.getPeople).not.toHaveBeenCalled();
  });
  for (const [admin, editionAdmin] of [
    [true, false],
    [false, true],
  ]) {
    it(`downloads a private PDF for global=${admin} edition=${editionAdmin}`, async () => {
      const deps = dependencies(admin, editionAdmin);
      const response = await handleKalakritiIdCards(request(), "2027", deps);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("content-disposition")).toContain(
        "kalakriti-2027-id-cards.pdf"
      );
      expect(await response.text()).toStartWith("%PDF-");
      expect(deps.getPeople).toHaveBeenCalledWith("edition-1");
    });
  }
  it("reports an empty roster without rendering", async () => {
    const deps = dependencies();
    deps.getPeople = mock(async () => []);
    expect((await handleKalakritiIdCards(request(), "2027", deps)).status).toBe(
      422
    );
    expect(deps.generatePdf).not.toHaveBeenCalled();
  });
  it("returns a safe error when rendering fails", async () => {
    const deps = dependencies();
    deps.generatePdf = mock(async () => {
      throw new Error("render failed");
    });
    expect((await handleKalakritiIdCards(request(), "2027", deps)).status).toBe(
      500
    );
  });
});
