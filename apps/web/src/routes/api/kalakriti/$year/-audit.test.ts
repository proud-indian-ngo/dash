// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { type AuditHandlerDeps, handleKalakritiAuditRequest } from "./audit";

const edition = {
  id: "00000000-0000-4000-8000-000000000001",
  year: 2027,
} as KalakritiEditionAccess["edition"];

function request(path = "/api/kalakriti/2027/audit") {
  return new Request(`http://localhost${path}`);
}

function deps(
  access: KalakritiEditionAccess | null,
  getPage: AuditHandlerDeps["getPage"] = vi.fn(async () => ({
    items: [],
    snapshotVersion: "100:100:",
    total: 0,
  })) as AuditHandlerDeps["getPage"]
): AuditHandlerDeps {
  return {
    getAccess: vi.fn(async () => access),
    getPage,
    getSession: vi.fn(async () => ({
      session: {
        user: { id: "user-1", role: "volunteer" },
      },
    })) as unknown as AuditHandlerDeps["getSession"],
  };
}

describe("Kalakriti audit API", () => {
  it("returns the session error without resolving audit access", async () => {
    const testDeps = deps(null);
    testDeps.getSession = vi.fn(async () => ({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }));

    const response = await handleKalakritiAuditRequest(
      request(),
      "2027",
      testDeps
    );

    expect(response.status).toBe(401);
    expect(testDeps.getAccess).not.toHaveBeenCalled();
    expect(testDeps.getPage).not.toHaveBeenCalled();
  });

  it.each([
    {
      authenticates: true,
      path: "/api/kalakriti/2027/audit?domain=unknown",
      year: "2027",
    },
    {
      authenticates: true,
      path: "/api/kalakriti/2027/audit?limit=9",
      year: "2027",
    },
    {
      authenticates: true,
      path: "/api/kalakriti/2027/audit?limit=101",
      year: "2027",
    },
    {
      authenticates: true,
      path: "/api/kalakriti/2027/audit?offset=-1",
      year: "2027",
    },
    {
      authenticates: false,
      path: "/api/kalakriti/2027/audit",
      year: "1999",
    },
  ])(
    "rejects an invalid audit query: $path ($year)",
    async ({ authenticates, path, year }) => {
      const testDeps = deps(null);

      const response = await handleKalakritiAuditRequest(
        request(path),
        year,
        testDeps
      );

      expect(response.status).toBe(400);
      expect(testDeps.getSession).toHaveBeenCalledTimes(authenticates ? 1 : 0);
      expect(testDeps.getAccess).not.toHaveBeenCalled();
      expect(testDeps.getPage).not.toHaveBeenCalled();
    }
  );

  it("returns the full Edition log scope to an Edition administrator", async () => {
    const getPage = vi.fn(async () => ({
      items: [],
      snapshotVersion: "100:100:",
      total: 0,
    }));
    const response = await handleKalakritiAuditRequest(
      request(),
      "2027",
      deps(
        {
          edition,
          isGlobalAdmin: false,
          membership: {
            assignments: [],
            id: "membership-1",
            kind: "volunteer",
            responsibilities: ["edition_admin"],
          },
        },
        getPage
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0"
    );
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(getPage).toHaveBeenCalledWith(
      expect.objectContaining({
        editionId: edition.id,
        scope: expect.objectContaining({ fullEdition: true }),
      })
    );
  });

  it("rejects an archived Edition for non-global administrators", async () => {
    const testDeps = deps({
      edition: { ...edition, lifecycle: "archived" },
      isGlobalAdmin: false,
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["edition_admin"],
      },
    });

    const response = await handleKalakritiAuditRequest(
      request(),
      "2027",
      testDeps
    );

    expect(response.status).toBe(403);
    expect(testDeps.getPage).not.toHaveBeenCalled();
  });

  it("passes only assigned Competition Category scope for a Category Lead", async () => {
    const getPage = vi.fn(async () => ({
      items: [],
      snapshotVersion: "100:100:",
      total: 0,
    }));
    const response = await handleKalakritiAuditRequest(
      request("/api/kalakriti/2027/audit?domain=schedule_configuration"),
      "2027",
      deps(
        {
          edition,
          isGlobalAdmin: false,
          membership: {
            assignments: [
              {
                centerId: null,
                competitionCategoryId: "category-1",
                competitionId: null,
                responsibility: "competition_category_lead",
              },
            ],
            id: "membership-1",
            kind: "volunteer",
            responsibilities: ["competition_category_lead"],
          },
        },
        getPage
      )
    );

    expect(response.status).toBe(200);
    expect(getPage).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "schedule_configuration",
        scope: expect.objectContaining({
          competitionCategoryIds: ["category-1"],
          fullEdition: false,
        }),
      })
    );
  });

  it("rejects ordinary members without querying audit rows", async () => {
    const testDeps = deps({
      edition,
      isGlobalAdmin: false,
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["liaison"],
      },
    });
    const response = await handleKalakritiAuditRequest(
      request(),
      "2027",
      testDeps
    );

    expect(response.status).toBe(403);
    expect(testDeps.getPage).not.toHaveBeenCalled();
  });

  it("rejects malformed snapshot versions", async () => {
    const testDeps = deps(null);
    const response = await handleKalakritiAuditRequest(
      request("/api/kalakriti/2027/audit?snapshotVersion=not-a-snapshot"),
      "2027",
      testDeps
    );

    expect(response.status).toBe(400);
    expect(testDeps.getAccess).not.toHaveBeenCalled();
  });

  it("rejects a structurally valid snapshot with invalid XID bounds", async () => {
    const testDeps = deps(null);
    const response = await handleKalakritiAuditRequest(
      request("/api/kalakriti/2027/audit?snapshotVersion=1%3A2%3A3"),
      "2027",
      testDeps
    );

    expect(response.status).toBe(400);
    expect(testDeps.getAccess).not.toHaveBeenCalled();
  });

  it("authenticates before rejecting an oversized snapshot", async () => {
    const testDeps = deps(null);
    testDeps.getSession = vi.fn(async () => ({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }));
    const oversizedSnapshot = `1:2000:${Array.from(
      { length: 1025 },
      (_, index) => index + 1
    ).join(",")}`;

    const response = await handleKalakritiAuditRequest(
      request(
        `/api/kalakriti/2027/audit?snapshotVersion=${encodeURIComponent(oversizedSnapshot)}`
      ),
      "2027",
      testDeps
    );

    expect(response.status).toBe(401);
    expect(testDeps.getAccess).not.toHaveBeenCalled();
    expect(testDeps.getPage).not.toHaveBeenCalled();
  });

  it("rejects snapshots with too many active transaction IDs", async () => {
    const testDeps = deps(null);
    const oversizedSnapshot = `1:2000:${Array.from(
      { length: 1025 },
      (_, index) => index + 1
    ).join(",")}`;

    const response = await handleKalakritiAuditRequest(
      request(
        `/api/kalakriti/2027/audit?snapshotVersion=${encodeURIComponent(oversizedSnapshot)}`
      ),
      "2027",
      testDeps
    );

    expect(response.status).toBe(400);
    expect(testDeps.getSession).toHaveBeenCalledOnce();
    expect(testDeps.getAccess).not.toHaveBeenCalled();
  });

  it("rejects snapshot strings beyond the supported length", async () => {
    const testDeps = deps(null);
    const xmin = 10_000_000_000_000_000_000n;
    const oversizedSnapshot = `${xmin}:${18_446_744_073_709_551_615n}:${Array.from(
      { length: 1024 },
      (_, index) => String(xmin + BigInt(index))
    ).join(",")}`;

    const response = await handleKalakritiAuditRequest(
      request(
        `/api/kalakriti/2027/audit?snapshotVersion=${encodeURIComponent(oversizedSnapshot)}`
      ),
      "2027",
      testDeps
    );

    expect(response.status).toBe(400);
    expect(testDeps.getSession).toHaveBeenCalledOnce();
    expect(testDeps.getAccess).not.toHaveBeenCalled();
  });

  it("forwards the stable snapshot and page window on later pages", async () => {
    const getPage = vi.fn(async () => ({
      items: [],
      snapshotVersion: "100:110:105,106",
      total: 70,
    }));
    const response = await handleKalakritiAuditRequest(
      request(
        "/api/kalakriti/2027/audit?limit=25&offset=50&snapshotVersion=100%3A110%3A105%2C106"
      ),
      "2027",
      deps(
        {
          edition,
          isGlobalAdmin: true,
          membership: null,
        },
        getPage
      )
    );

    expect(response.status).toBe(200);
    expect(getPage).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
        offset: 50,
        snapshotVersion: "100:110:105,106",
      })
    );
  });
});
