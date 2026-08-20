import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
  useZero: () => ({}),
}));
vi.mock("@/components/kalakriti/competition-assignment-dialog", () => ({
  CompetitionAssignmentDialog: () => null,
}));
vi.mock("@/components/kalakriti/volunteer-assignment-dialog", () => ({
  VolunteerAssignmentDialog: () => null,
}));
vi.mock("@/components/kalakriti/volunteer-detail-sheet", () => ({
  VolunteerDetailSheet: () => null,
}));
vi.mock("@/components/kalakriti/volunteers-table", () => ({
  VolunteersTable: () => null,
}));
vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("@/functions/users-for-picker", () => ({
  getKalakritiVolunteersForPicker: async () => [],
}));

import { Route } from "@/routes/_app/kalakriti/$year/volunteers";

function runBeforeLoad({
  isGlobalAdmin = false,
  responsibilities = [],
}: {
  isGlobalAdmin?: boolean;
  responsibilities?: string[];
}) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Volunteers route guard is missing");
  }
  return beforeLoad({
    context: {
      kalakritiEditionAccess: {
        isGlobalAdmin,
        membership: isGlobalAdmin
          ? null
          : { assignments: [], kind: "volunteer", responsibilities },
      },
    },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti Volunteers route guard", () => {
  it.each([
    ["global administrator", { isGlobalAdmin: true }],
    ["Edition Administrator", { responsibilities: ["edition_admin"] }],
    ["Volunteer Coordinator", { responsibilities: ["volunteer_coordinator"] }],
  ])("allows a %s", (_label, candidate) => {
    expect(() => runBeforeLoad(candidate)).not.toThrow();
  });

  it("rejects an unrelated Edition member", () => {
    expect(() =>
      runBeforeLoad({ responsibilities: ["overall_events_lead"] })
    ).toThrow();
  });
});
