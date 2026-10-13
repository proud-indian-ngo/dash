import { createFileRoute, Outlet } from "@tanstack/react-router";

import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/donors")({
  beforeLoad: ({ context }) => assertPermission(context, "donors.view"),
  component: () => <Outlet />,
});
