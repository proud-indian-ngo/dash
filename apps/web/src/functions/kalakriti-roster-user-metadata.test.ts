import { describe, expect, it, mock } from "bun:test";

import {
  getKalakritiRosterUserMetadataWithDeps,
  type KalakritiRosterUserMetadata,
} from "./kalakriti-roster-user-metadata";

const editionId = "edition-1";
const session = { user: { id: "user-1", role: "volunteer" } };
const metadata: KalakritiRosterUserMetadata[] = [
  { registrationGroup: "Group A", userId: "volunteer-1" },
];

function depsFor(
  assignments: { lifecycle: string; responsibility: string }[],
  permissions: string[] = []
) {
  return {
    listAccessAssignments: mock(async () => assignments),
    listMetadata: mock(async () => metadata),
    resolvePermissions: mock(async () => permissions),
  };
}

describe("getKalakritiRosterUserMetadataWithDeps", () => {
  it("rejects a missing session before reading authorization or metadata", async () => {
    const deps = depsFor([]);

    await expect(
      getKalakritiRosterUserMetadataWithDeps({ session: null }, editionId, deps)
    ).rejects.toThrow("Unauthorized");
    expect(deps.resolvePermissions).not.toHaveBeenCalled();
    expect(deps.listMetadata).not.toHaveBeenCalled();
  });

  it("rejects users outside the exact roster scope", async () => {
    const deps = depsFor([
      {
        lifecycle: "archived",
        responsibility: "volunteer_management_volunteer",
      },
    ]);

    await expect(
      getKalakritiRosterUserMetadataWithDeps({ session }, editionId, deps)
    ).rejects.toThrow("Forbidden");
    expect(deps.listMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ["edition_admin", "archived"],
    ["volunteer_coordinator", "archived"],
    ["volunteer_management_volunteer", "live"],
  ])("allows %s during %s", async (responsibility, lifecycle) => {
    const deps = depsFor([{ lifecycle, responsibility }]);

    expect(
      await getKalakritiRosterUserMetadataWithDeps({ session }, editionId, deps)
    ).toEqual(metadata);
  });

  it("allows kalakriti admins without an edition assignment", async () => {
    const deps = depsFor([], ["kalakriti.admin"]);

    expect(
      await getKalakritiRosterUserMetadataWithDeps({ session }, editionId, deps)
    ).toEqual(metadata);
    expect(deps.listAccessAssignments).not.toHaveBeenCalled();
  });

  it("rechecks current access before every metadata read", async () => {
    let assignments = [
      { lifecycle: "live", responsibility: "volunteer_coordinator" },
    ];
    const deps = {
      listAccessAssignments: mock(async () => assignments),
      listMetadata: mock(async () => metadata),
      resolvePermissions: mock(async () => []),
    };

    expect(
      await getKalakritiRosterUserMetadataWithDeps({ session }, editionId, deps)
    ).toEqual(metadata);
    assignments = [];
    await expect(
      getKalakritiRosterUserMetadataWithDeps({ session }, editionId, deps)
    ).rejects.toThrow("Forbidden");
    expect(deps.listMetadata).toHaveBeenCalledTimes(1);
  });
});
