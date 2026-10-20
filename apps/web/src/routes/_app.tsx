import { Separator } from "@pi-dash/design-system/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
} from "@pi-dash/design-system/components/ui/sidebar";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { useConnectionState, useZero } from "@rocicorp/zero/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { log } from "evlog";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { ZeroInit } from "@/components/zero-init";
import { AppProvider, useApp } from "@/context/app-context";
import { getCachedAuth } from "@/lib/auth-cache";
import { loadPostHogAfterLoad } from "@/lib/load-posthog";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const { session, permissions } = await getCachedAuth();

    if (!session) {
      throw redirect({
        search: { redirect: location.href },
        to: "/login",
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

const showSyncErrorToast = debounce(
  () => toast.error("Couldn't sync data. Check your connection."),
  3000,
  { leading: true, trailing: false }
);

// Zero stops retrying in `error`, but some server errors are transient (a
// reload racing the previous page's connection can drop shared query work, in
// bursts), so reconnect, up to a limit per minute, before telling the user.
const MAX_ERROR_RECONNECTS_PER_MINUTE = 10;

function extractReason(state: { reason?: unknown }): string {
  return typeof state.reason === "string"
    ? state.reason
    : JSON.stringify(state.reason ?? "unknown");
}

function ZeroConnectionMonitor({ onConnected }: { onConnected: () => void }) {
  const zero = useZero();
  const state = useConnectionState();
  const prevName = useRef<string | null>(null);
  const errorReconnectTimes = useRef<number[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.name === prevName.current) {
      return;
    }

    if (state.name === "connected") {
      onConnected();
    } else if (state.name === "needs-auth") {
      log.error({
        component: "ZeroConnectionMonitor",
        message: "Zero connection: needs-auth",
        reason: extractReason(state),
      });
      navigate({
        search: { redirect: window.location.pathname },
        to: "/login",
      });
    } else if (state.name === "error") {
      log.error({
        component: "ZeroConnectionMonitor",
        message: `Zero connection: ${state.name}`,
        reason: extractReason(state),
      });
      const now = Date.now();
      errorReconnectTimes.current = errorReconnectTimes.current.filter(
        (time) => now - time < 60_000
      );
      if (
        errorReconnectTimes.current.length < MAX_ERROR_RECONNECTS_PER_MINUTE
      ) {
        errorReconnectTimes.current.push(now);
        zero.connection.connect();
      } else {
        showSyncErrorToast();
      }
    }

    prevName.current = state.name;
  }, [state, navigate, onConnected, zero]);

  return null;
}

function AppLayout() {
  const { permissions, session } = Route.useRouteContext();

  return (
    <ZeroInit
      permissions={permissions}
      role={session.user.role}
      userId={session.user.id}
    >
      <AuthenticatedAppLayout permissions={permissions} session={session} />
    </ZeroInit>
  );
}

function AuthenticatedAppLayout({
  permissions,
  session,
}: {
  permissions: string[];
  session: ReturnType<typeof Route.useRouteContext>["session"];
}) {
  const isMobile = useIsMobile();
  const [zeroConnected, setZeroConnected] = useState(false);
  const handleConnected = useCallback(() => setZeroConnected(true), []);

  return (
    <AppProvider permissions={permissions} user={session.user}>
      <SidebarProvider>
        <ZeroConnectionMonitor onConnected={handleConnected} />
        <LogIdentitySync />
        <AppSidebar />
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
                {isMobile ? null : <Breadcrumbs />}
              </div>
              <div className="flex items-center gap-1">
                {isMobile ? <NotificationBell side="bottom" /> : null}
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
