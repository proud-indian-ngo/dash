import { describe, expect, it, vi } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

vi.mock("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
vi.mock("@pi-dash/design-system/components/ui/card", () => ({
  Card: () => null,
  CardContent: () => null,
  CardDescription: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock("@/components/data-table/table-filter-select", () => ({
  TableFilterSelect: () => null,
}));
vi.mock("@/components/kalakriti/audit-table", () => ({
  KalakritiAuditTable: () => null,
}));

import { Route } from "@/routes/_app/kalakriti/$year/audit";

function runBeforeLoad(editionAccess: KalakritiEditionAccess) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Audit route guard is missing");
  }
  return beforeLoad({
    context: { kalakritiEditionAccess: editionAccess },
  } as Parameters<typeof beforeLoad>[0]);
}

function createAccess(
  responsibility: "competition_category_lead" | "edition_admin" | "liaison"
): KalakritiEditionAccess {
  return {
    edition: {} as KalakritiEditionAccess["edition"],
    isGlobalAdmin: false,
    membership: {
      assignments:
        responsibility === "competition_category_lead"
          ? [
              {
                centerId: null,
                competitionCategoryId: "category-1",
                competitionId: null,
                responsibility,
              },
            ]
          : [],
      id: "membership-1",
      kind: "volunteer",
      responsibilities: [responsibility],
    },
  };
}

describe("Kalakriti audit route guard", () => {
  it.each(["edition_admin", "competition_category_lead"] as const)(
    "allows a %s",
    (responsibility) => {
      expect(() => runBeforeLoad(createAccess(responsibility))).not.toThrow();
    }
  );

  it("rejects an ordinary Edition member", () => {
    expect(() => runBeforeLoad(createAccess("liaison"))).toThrow();
  });
});
