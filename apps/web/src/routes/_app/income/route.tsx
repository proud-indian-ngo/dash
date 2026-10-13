import { INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/income")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...INCOME_PERMISSIONS),
  component: () => <Outlet />,
});
