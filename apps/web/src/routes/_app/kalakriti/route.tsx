import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getCoordinatedCurrentKalakritiEditionAccess } from "@/lib/kalakriti-access-request";

export const Route = createFileRoute("/_app/kalakriti")({
  beforeLoad: async ({ context }) => {
    if (
      context.permissions?.includes("kalakriti.view") ||
      context.permissions?.includes("kalakriti.admin")
    ) {
      return;
    }
    const access = await getCoordinatedCurrentKalakritiEditionAccess(
      context.session
    );
    if (!access) {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
