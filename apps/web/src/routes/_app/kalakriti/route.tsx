import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentKalakritiEditionAccess } from "@/functions/kalakriti-access";

export const Route = createFileRoute("/_app/kalakriti")({
  beforeLoad: async ({ context }) => {
    if (
      context.permissions?.includes("kalakriti.view") ||
      context.permissions?.includes("kalakriti.admin")
    ) {
      return;
    }
    const access = await getCurrentKalakritiEditionAccess();
    if (!access) {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
