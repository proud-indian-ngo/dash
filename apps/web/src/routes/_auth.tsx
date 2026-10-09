import { eventPagePath } from "@pi-dash/shared/event-redirect";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getSession } from "@/functions/get-session";
import { registerLinkEventRedirect } from "@/lib/auth-route-policy";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();

    if (session) {
      // Signed-in volunteers following a website sign-up link go to the
      // event, where they can show interest themselves.
      const eventRedirect =
        location.pathname === "/register"
          ? registerLinkEventRedirect(location.search)
          : null;
      throw eventRedirect
        ? redirect({ href: eventPagePath(eventRedirect) })
        : redirect({ to: "/" });
    }
  },
  component: AuthRouteLayout,
});

function AuthRouteLayout() {
  return <Outlet />;
}
