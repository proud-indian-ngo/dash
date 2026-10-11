import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: mock(),
}));
mock.module("@pi-dash/db/queries/social-api", () => ({
  listSocialPeople: mock(),
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));

import { buildSocialPeople } from "@/components/social/use-social-people";

import { loadSocialPeople, type SocialPeopleDeps } from "./social-people";

const people = {
  candidates: [{ id: "u1", name: "Asha" }],
  named: [{ id: "u9", name: "Former admin" }],
};

function deps(permissions: string[]): SocialPeopleDeps {
  return {
    listSocialPeople: mock(async () => people),
    resolvePermissions: mock(async () => permissions),
  };
}

const session = (role: string) => ({ user: { id: "me", role } });

describe("loadSocialPeople", () => {
  it("refuses a missing session and a volunteer", async () => {
    await expect(loadSocialPeople(null, [], deps([]))).rejects.toThrow(
      "Unauthorized"
    );
    const volunteer = deps(["events.view_own"]);
    await expect(
      loadSocialPeople(session("volunteer"), [], volunteer)
    ).rejects.toThrow("Forbidden");
    expect(volunteer.listSocialPeople).not.toHaveBeenCalled();
  });

  it.each([["social.manage"], ["users.view"]])(
    "returns ids and names to %s",
    async (permission) => {
      const allowed = deps([permission]);
      expect(
        await loadSocialPeople(session("custom"), ["u9"], allowed)
      ).toEqual(people);
      expect(allowed.listSocialPeople).toHaveBeenCalledWith(["u9"]);
    }
  );

  it("merges candidates and named users into one lookup", () => {
    const merged = buildSocialPeople(people);
    expect(merged.candidates).toEqual(people.candidates);
    expect(merged.names.get("u9")).toBe("Former admin");
    expect(merged.names.get("u1")).toBe("Asha");
  });
});
