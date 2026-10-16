import { REGISTRATIONS_PAGE_PERMISSIONS } from "@pi-dash/shared/governance";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { assertAnyPermission } from "@/lib/route-guards";

/** Each page guards itself too: finance may see registrations but not the register. */
export const Route = createFileRoute("/_app/governance")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...REGISTRATIONS_PAGE_PERMISSIONS),
  component: () => <Outlet />,
});
