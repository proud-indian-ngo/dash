import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/settings/roles")({
  beforeLoad: ({ context }) => assertPermission(context, "settings.roles"),
  component: () => <Outlet />,
});
