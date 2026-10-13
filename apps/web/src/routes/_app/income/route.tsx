import { createFileRoute, Outlet } from "@tanstack/react-router";

import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/income")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, "donors.view", "finance.view"),
  component: () => <Outlet />,
});
