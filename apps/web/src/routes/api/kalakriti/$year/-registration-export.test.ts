// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));

import { buildKalakritiRegistrationCsvArchive } from "@/lib/kalakriti-registration-export";
import {
  handleKalakritiRegistrationExportRequest,
  type RegistrationExportHandlerDependencies,
} from "./registration-export";

function request(year = 2027) {
  return new Request(
    `http://localhost/api/kalakriti/${year}/registration-export`
  );
}

function dependencies(): RegistrationExportHandlerDependencies {
  return {
    buildArchive: buildKalakritiRegistrationCsvArchive,
    getExport: vi.fn(async () => ({
      entries: [
        {
          ageCategory: "Junior",
          center: "Jayanagar",
          competition: "Drawing",
          competitionCategory: "Art",
          endAt: "2027-11-21T05:00:00.000Z",
          entryId: "entry-1",
          participantIds: ["K27-001"],
          participantNames: ["=1+1"],
          participationMode: "individual",
          startAt: "2027-11-21T04:00:00.000Z",
          venue: "Hall A",
        },
      ],
      students: [],
    })),
    getSession: vi.fn(async () => ({
      session: { user: { id: "guardian-1", role: "guest" } },
    })) as unknown as RegistrationExportHandlerDependencies["getSession"],
    resolveScope: vi.fn(async () => ({
      editionId: "edition-1",
      scopes: [{ centerIds: ["center-1"], kind: "center" as const }],
    })),
  };
}

describe("Kalakriti registration export API", () => {
  it("rejects an invalid year before authenticating", async () => {
    const deps = dependencies();
    const response = await handleKalakritiRegistrationExportRequest(
      request(),
      "not-a-year",
      deps
    );

    expect(response.status).toBe(400);
    expect(deps.getSession).not.toHaveBeenCalled();
  });

  it("returns the session failure without resolving a scope", async () => {
    const deps = dependencies();
    deps.getSession = vi.fn(async () => ({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }));

    const response = await handleKalakritiRegistrationExportRequest(
      request(),
      "2027",
      deps
    );

    expect(response.status).toBe(401);
    expect(deps.resolveScope).not.toHaveBeenCalled();
  });

  it("fails closed when a changed Edition year has no scoped access", async () => {
    const deps = dependencies();
    deps.resolveScope = vi.fn(async () => null);

    const response = await handleKalakritiRegistrationExportRequest(
      request(2028),
      "2028",
      deps
    );

    expect(response.status).toBe(404);
    expect(deps.resolveScope).toHaveBeenCalledWith({
      sessionUser: { id: "guardian-1", role: "guest" },
      year: 2028,
    });
    expect(deps.getExport).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user without an assigned export scope", async () => {
    const deps = dependencies();
    deps.resolveScope = vi.fn(async () => ({
      editionId: "edition-1",
      scopes: [],
    }));

    const response = await handleKalakritiRegistrationExportRequest(
      request(),
      "2027",
      deps
    );

    expect(response.status).toBe(403);
    expect(deps.getExport).not.toHaveBeenCalled();
  });

  it("streams a private allowlisted archive for the server-resolved scope", async () => {
    const deps = dependencies();
    const response = await handleKalakritiRegistrationExportRequest(
      request(),
      "2027",
      deps
    );

    expect(deps.getExport).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [{ centerIds: ["center-1"], kind: "center" }],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "kalakriti-2027-registration.zip"
    );
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "kalakriti-2027-competition-entries.csv",
      "kalakriti-2027-students.csv",
    ]);
    expect(
      strFromU8(
        files["kalakriti-2027-competition-entries.csv"] ?? new Uint8Array()
      )
    ).toContain(",'=1+1,");
  });
});
