import { env } from "@pi-dash/env/web";
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
    <main
      className="flex min-h-dvh items-center justify-center p-6 md:p-10"
      id="main"
      tabIndex={-1}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img
            alt=""
            className="size-8"
            height={32}
            src="/favicon-96x96.png"
            width={32}
          />
          <span className="font-semibold text-lg">{env.VITE_APP_NAME}</span>
        </div>
        <Outlet />
      </div>
    </main>
  );
}
