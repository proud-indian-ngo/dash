import { Separator } from "@pi-dash/design-system/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@pi-dash/design-system/components/ui/sidebar";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import type { Zero } from "@rocicorp/zero";
import { ZeroContext } from "@rocicorp/zero/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
import { log } from "evlog";
import { useCallback, useEffect, useState } from "react";

import { BackgroundRouteWarmup } from "@/components/background-route-warmup";
import { PolicyGate } from "@/components/governance/policy-gate";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { NavMainGrouped } from "@/components/layout/nav-main";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { ZeroConnectionMonitor } from "@/components/zero-connection-monitor";
import { ZeroInit } from "@/components/zero-init";
import { AppProvider, useApp } from "@/context/app-context";
import { getCachedAuth } from "@/lib/auth-cache";
import { loadPostHogAfterLoad } from "@/lib/load-posthog";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const { session, permissions, policiesPending } = await getCachedAuth();

    if (!session) {
      throw redirect({
        search: { redirect: location.href },
        to: "/login",
      });
    }
    if (policiesPending) {
      throw redirect({
        search: { redirect: location.href },
        to: "/accept-policies",
      });
    }

    return { permissions, session };
  },
  component: AppLayout,
  staleTime: Number.POSITIVE_INFINITY,
});

const loadClientLogger = () => import("@/lib/client-logger");

function LogIdentitySync() {
  const { user } = useApp();

  useEffect(() => {
    loadClientLogger()
      .then(({ setLogIdentity }) =>
        setLogIdentity(user.id, user.role ?? "volunteer")
      )
      .catch((error) => {
        log.error({
          action: "setLogIdentity",
          component: "LogIdentitySync",
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      });
    loadPostHogAfterLoad()
      .then(({ identifyUser }) =>
        identifyUser(user.id, { role: user.role ?? "volunteer" })
      )
      .catch((error) => {
        log.error({
          action: "identifyPostHogUser",
          component: "LogIdentitySync",
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      });
    // PostHog resets on logout and when another account identifies.
    return () => {
      loadClientLogger()
        .then(({ clearLogIdentity }) => clearLogIdentity())
        .catch((error) => {
          log.error({
            action: "clearLogIdentity",
            component: "LogIdentitySync",
            error: error instanceof Error ? error.message : String(error),
            userId: user.id,
          });
        });
    };
  }, [user.id, user.role]);

  return null;
}

function AppLayout() {
  const { permissions, session } = Route.useRouteContext();
  const isExportRoute = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/_app/export"),
  });

  return (
    <AuthenticatedRuntime
      key={`${session.user.id}:${session.user.role}`}
      permissions={permissions}
      serverRender={isExportRoute}
      session={session}
    />
  );
}

function AuthenticatedRuntime({
  permissions,
  serverRender,
  session,
}: {
  permissions: string[];
  serverRender: boolean;
  session: ReturnType<typeof Route.useRouteContext>["session"];
}) {
  const [zero, setZero] = useState<Zero>();

  return (
    <ZeroContext value={zero}>
      <ZeroInit
        onReady={setZero}
        permissions={permissions}
        role={session.user.role}
        userId={session.user.id}
      >
        {null}
      </ZeroInit>
      {zero || serverRender ? (
        <AuthenticatedAppLayout
          initializing={!zero}
          permissions={permissions}
          session={session}
        />
      ) : null}
    </ZeroContext>
  );
}

function ExportSidebarFallback() {
  const { navGroups, user } = useApp();
  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarBrand />
        </SidebarHeader>
        <SidebarContent>
          <NavMainGrouped groups={navGroups} />
        </SidebarContent>
        <SidebarFooter>
          <div className="flex h-12 flex-col justify-center px-2">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <MobileTabBar
        groups={navGroups}
        preferredUrls={["/", "/events", "/reimbursements", "/teams"]}
      />
    </>
  );
}

function AuthenticatedAppLayout({
  initializing = false,
  permissions,
  session,
}: {
  initializing?: boolean;
  permissions: string[];
  session: ReturnType<typeof Route.useRouteContext>["session"];
}) {
  const isMobile = useIsMobile();
  const [zeroConnected, setZeroConnected] = useState(false);
  const handleConnected = useCallback(() => setZeroConnected(true), []);

  return (
    <AppProvider permissions={permissions} user={session.user}>
      <SidebarProvider>
        {zeroConnected ? <BackgroundRouteWarmup /> : null}
        {initializing ? null : (
          <>
            <ZeroConnectionMonitor onConnected={handleConnected} />
            <LogIdentitySync />
            {session.user.role === "external_user" ? null : <PolicyGate />}
          </>
        )}
        {initializing ? <ExportSidebarFallback /> : <AppSidebar />}
        {/* Clip, not scroll: a stray hit area or shadow at the edge must not pan the phone page sideways. */}
        <SidebarInset
          className="min-w-0 overflow-x-clip"
          data-zero-ready={zeroConnected || undefined}
          id="main"
          tabIndex={-1}
        >
          <header className="flex h-12 shrink-0 items-center">
            <div className="flex h-full flex-1 items-center justify-between px-2 sm:px-4">
              {/* Phones navigate with the tab bar; the logo takes the toggle's place. */}
              <div className="flex items-center md:hidden">
                <SidebarBrand />
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <SidebarToggle />
                <Separator
                  className="mr-2 self-stretch!"
                  orientation="vertical"
                />
                {initializing ? (
                  <span className="text-sm">Export Data</span>
                ) : isMobile ? null : (
                  <Breadcrumbs />
                )}
              </div>
              <div className="flex items-center gap-1">
                {initializing ? (
                  <span className="size-8 md:hidden" />
                ) : isMobile ? (
                  <NotificationBell side="bottom" />
                ) : null}
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className="flex min-w-0 flex-1 flex-col gap-4 px-2 pb-[calc(1rem+var(--mobile-tab-bar-height))] sm:px-4">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppProvider>
  );
}
