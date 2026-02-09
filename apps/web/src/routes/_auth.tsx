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
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
