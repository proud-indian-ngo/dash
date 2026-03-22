import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "@/functions/get-session";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const session = await getSession();

    if (session) {
      throw redirect({
        to: "/",
      });
    }
  },
  component: AuthRouteLayout,
});

function AuthRouteLayout() {
  return <Outlet />;
}
