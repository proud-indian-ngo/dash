import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/vendors")({
  beforeLoad: ({ context }) => assertPermission(context, "vendors.view_all"),
  component: () => <Outlet />,
});
