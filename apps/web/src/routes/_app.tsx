import { Separator } from "@pi-dash/design-system/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@pi-dash/design-system/components/ui/sidebar";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useCourier } from "@trycourier/courier-react";
import { useEffect, useRef } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppProvider, useApp } from "@/context/app-context";
import { getCourierToken } from "@/functions/courier-token";
import { getSession } from "@/functions/get-session";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();

    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }

    return { session };
  },
  component: AppLayout,
});

function CourierAuth() {
  const { user } = useApp();
  const courier = useCourier();
  const signedInRef = useRef(false);

  useEffect(() => {
    if (signedInRef.current) {
      return;
    }
    signedInRef.current = true;

    getCourierToken().then(({ token }) => {
      if (token) {
        courier.shared.signIn({ userId: user.id, jwt: token });
      }
    });
  }, [user.id, courier]);

  return null;
}

function AppLayout() {
  const isMobile = useIsMobile();
  const { session } = Route.useRouteContext();

  return (
    <AppProvider user={session.user}>
      <SidebarProvider>
        <CourierAuth />
        <AppSidebar />
        <SidebarInset className="min-w-0" id="main" tabIndex={-1}>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex flex-1 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  className="mr-2 data-[orientation=vertical]:h-4"
                  orientation="vertical"
                />
                {isMobile ? null : <Breadcrumbs />}
              </div>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppProvider>
  );
}
