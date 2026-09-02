import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
mock.module("@pi-dash/design-system/components/ui/select", () => ({
  Select: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
}));
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
  useZero: () => ({}),
}));
mock.module("@/components/kalakriti/student-form-dialog", () => ({
  StudentFormDialog: () => null,
}));
mock.module("@/components/kalakriti/student-table", () => ({
  StudentTable: () => null,
}));
mock.module("@/components/loader", () => ({ Loader: () => null }));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

import { Route } from "@/routes/_app/kalakriti/$year/students";

function runBeforeLoad({
  isGlobalAdmin = false,
  kind = "volunteer",
  responsibilities = [],
}: {
  isGlobalAdmin?: boolean;
  kind?: "guardian" | "volunteer";
  responsibilities?: string[];
}) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Student route guard is missing");
  }
  return beforeLoad({
    context: {
      kalakritiEditionAccess: {
        isGlobalAdmin,
        membership: isGlobalAdmin
          ? null
          : { assignments: [], kind, responsibilities },
      },
    },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti Student route guard", () => {
  it.each([
    ["global administrator", { isGlobalAdmin: true }],
    ["Guardian", { kind: "guardian" as const }],
    ["Edition Administrator", { responsibilities: ["edition_admin"] }],
    ["Liaison", { responsibilities: ["liaison"] }],
  ])("allows a %s", (_label, candidate) => {
    expect(() => runBeforeLoad(candidate)).not.toThrow();
  });

  it("rejects an unrelated Edition member", () => {
    expect(() =>
      runBeforeLoad({ responsibilities: ["transport_lead"] })
    ).toThrow();
  });
});
