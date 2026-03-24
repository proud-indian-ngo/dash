import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertAdmin } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/vendors")({
  beforeLoad: ({ context }) => assertAdmin(context),
  component: () => <Outlet />,
});
