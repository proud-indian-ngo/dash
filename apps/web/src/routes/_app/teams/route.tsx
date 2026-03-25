import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/teams")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, "teams.view_own", "teams.view_all"),
  component: () => <Outlet />,
});
