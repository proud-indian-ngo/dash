import {
  LogoutIcon,
  Settings01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@pi-dash/design-system/components/ui/sidebar";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";

import { NotificationBell } from "@/components/layout/notification-bell";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";
import { invalidateAuthCache } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";

const loadPostHog = () => import("@/lib/posthog");

export function NavUser() {
  const { isMobile, setOpenMobile } = useSidebar();
  const zero = useZero();
  const { user } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const stableOnClick1 = useEventCallback(() => {
    setOpenMobile(false);
    navigate({ to: "/settings/profile" });
  });
  const stableOnClick2 = useEventCallback(async () => {
    try {
      await zero.delete();
    } catch (error: unknown) {
      log.error({
        action: "logout.clearCache",
        component: "NavUser",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          invalidateAuthCache();
          await loadPostHog()
            .then(({ resetUser }) => resetUser())
            .catch(() => {
              // Non-critical
            });
          window.location.replace("/login");
        },
      },
    });
  });

  const accountTrigger = (
    <SidebarMenuButton
      aria-label="Account menu"
      className="aria-expanded:bg-muted flex-1"
      size="lg"
    >
      <UserAvatar user={user} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
      <HugeiconsIcon
        className="ml-auto size-4"
        icon={UnfoldMoreIcon}
        strokeWidth={2}
      />
    </SidebarMenuButton>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
        {isMobile ? (
          <ResponsiveActionMenu
            title="Account actions"
            trigger={accountTrigger}
            actions={[
              {
                id: "settings",
                label: "Settings",
                icon: Settings01Icon,
                onSelect: stableOnClick1,
              },
              {
                id: "logout",
                label: "Log out",
                icon: LogoutIcon,
                onSelect: stableOnClick2,
                destructive: true,
              },
            ]}
          />
        ) : (
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <DropdownMenuTrigger render={accountTrigger} />
            <DropdownMenuContent
              align="end"
              className="min-w-56"
              side="right"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <UserAvatar user={user} />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={stableOnClick1}>
                  <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={stableOnClick2}>
                <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isMobile ? null : (
          <NotificationBell
            className="text-sidebar-foreground/80 hover:bg-sidebar-foreground/5"
            dotClassName="ring-sidebar"
          />
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
