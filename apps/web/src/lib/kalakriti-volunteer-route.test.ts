import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
  useZero: () => ({}),
}));
mock.module("@/components/kalakriti/kalakriti-add-volunteers-dialog", () => ({
  KalakritiAddVolunteersDialog: () => null,
}));
mock.module("@/components/kalakriti/kalakriti-page-header", () => ({
  KalakritiPageHeader: () => null,
}));
mock.module("@/components/kalakriti/kalakriti-role-assignment-dialog", () => ({
  KalakritiRoleAssignmentDialog: () => null,
}));
mock.module("@/components/kalakriti/volunteer-detail-sheet", () => ({
  VolunteerDetailSheet: () => null,
}));
mock.module("@/components/kalakriti/volunteers-table", () => ({
  VolunteersTable: () => null,
}));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
mock.module("@/functions/users-for-picker", () => ({
  getKalakritiAddVolunteersForPicker: async () => [],
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
