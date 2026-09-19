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
        return printedCard ? { id: "assignment" } : undefined;
      });
      const request = assertCanManageVolunteerRoster(
        { run } as never,
        actor as never,
        "edition-1",
        printedCard
      );
      if (printedCard) await request;
      else await expect(request).rejects.toThrow("Unauthorized");
      const membershipScope = JSON.stringify(run.mock.calls[0]?.[0].ast);
      for (const value of ["operator", "edition-1", "active", "volunteer"])
        expect(membershipScope).toContain(value);
    }
  );
  it("rejects absent or revoked membership before inspecting assignments", async () => {
    const run = mock(async () => undefined);
    await expect(
      assertCanManageVolunteerRoster({ run }, actor as never, "edition-1", true)
    ).rejects.toThrow("Unauthorized");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
