import { describe, expect, it, mock } from "bun:test";

import { assertCanManageVolunteerRoster } from "../kalakriti-volunteer-enroll";

const actor = { userId: "operator", permissions: ["kalakriti.view"] };

describe("Volunteer card registration authority", () => {
  it.each([true, false])(
    "scopes roster authorization with printedCard=%s",
    async (printedCard) => {
      const run = mock(async (query: { ast: { table: string } }) => {
        if (query.ast.table === "kalakritiEditionMembership")
          return { id: "membership" };
        const scope = JSON.stringify(query.ast);
        expect(scope).toContain("edition-1");
        expect(scope.includes("volunteer_management_volunteer")).toBe(
          printedCard
        );
        return printedCard
          ? [{ responsibility: "volunteer_management_volunteer" }]
          : [];
      });
      const request = assertCanManageVolunteerRoster(
        { run } as never,
        actor as never,
        "edition-1",
        printedCard
      );
      if (printedCard) expect(await request).toBe("printed_card");
      else await expect(request).rejects.toThrow("Unauthorized");
      const membershipScope = JSON.stringify(run.mock.calls[0]?.[0].ast);
      for (const value of ["operator", "edition-1", "active", "volunteer"])
        expect(membershipScope).toContain(value);
    }
  );
  it("treats a coordinator who is also a Volunteer Management Volunteer as a roster manager", async () => {
    const run = mock(async (query: { ast: { table: string } }) =>
      query.ast.table === "kalakritiEditionMembership"
        ? { id: "membership" }
        : [
            { responsibility: "volunteer_management_volunteer" },
            { responsibility: "volunteer_coordinator" },
          ]
    );
    expect(
      await assertCanManageVolunteerRoster(
        { run } as never,
        actor as never,
        "edition-1",
        true
      )
    ).toBe("manager");
  });
  it("rejects absent or revoked membership before inspecting assignments", async () => {
    const run = mock(async () => undefined);
    await expect(
      assertCanManageVolunteerRoster({ run }, actor as never, "edition-1", true)
    ).rejects.toThrow("Unauthorized");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
