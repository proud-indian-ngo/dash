import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/reimbursements")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, "requests.view_own", "requests.view_all"),
  component: () => <Outlet />,
});
