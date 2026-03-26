import {
  LogoutIcon,
  NotificationIcon,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@pi-dash/design-system/components/ui/sidebar";
import { useTheme } from "@pi-dash/design-system/lib/theme-provider";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import type {
  CourierInboxListItemFactoryProps,
  CourierInboxTheme,
} from "@trycourier/courier-react";
import { log } from "evlog";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const CourierInbox = lazy(() =>
  import("@trycourier/courier-react").then((m) => ({
    default: m.CourierInbox,
  }))
);

import { SettingsDialog } from "@/components/settings/settings-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";
import { useUnreadNotificationCount } from "@/hooks/use-unread-notification-count";
import { invalidateAuthCache } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";

const PRIMARY_LIGHT = "oklch(0.52 0.105 223.128)";
const PRIMARY_DARK = "oklch(0.45 0.085 224.283)";

function courierTheme(primary: string): CourierInboxTheme {
  return {
    inbox: {
      header: {
        feeds: {
          button: {
            unreadCountIndicator: { backgroundColor: primary },
          },
          tabs: {
            selected: {
              indicatorColor: primary,
              unreadIndicator: { backgroundColor: primary },
            },
            default: {
              unreadIndicator: { backgroundColor: primary },
            },
          },
        },
        tabs: {
          selected: {
            indicatorColor: primary,
            unreadIndicator: { backgroundColor: primary },
          },
          default: {
            unreadIndicator: { backgroundColor: primary },
          },
        },
      },
      list: {
        item: {
          unreadIndicatorColor: primary,
        },
      },
    },
  };
}

const COURIER_LIGHT_THEME = courierTheme(PRIMARY_LIGHT);
const COURIER_DARK_THEME = courierTheme(PRIMARY_DARK);

export function NavUser() {
  const { isMobile } = useSidebar();
  const zero = useZero();
  const navigate = useNavigate();
  const { user, openSettings } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme: mode } = useTheme();
  const unreadCount = useUnreadNotificationCount();
  const [badgePulseToken, setBadgePulseToken] = useState(0);
  const previousUnreadCount = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > previousUnreadCount.current) {
      setBadgePulseToken((current) => current + 1);
    }
    previousUnreadCount.current = unreadCount;
  }, [unreadCount]);

  const hasUnreadNotifications = unreadCount > 0;
  const hasPulsed = badgePulseToken > 0;
  const unreadCountLabel = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="flex-1 aria-expanded:bg-muted"
                size="lg"
              />
            }
          >
            <span className="relative">
              <UserAvatar user={user} />
              {hasUnreadNotifications && (
                <span
                  aria-hidden="true"
                  className="fade-in-0 zoom-in-0 absolute -top-0.5 -right-0.5 size-2.5 animate-in transition-all duration-150 ease-(--ease-out-expo)"
                >
                  <span
                    className={cn(
                      "block size-full rounded-full bg-destructive ring-2 ring-sidebar",
                      hasPulsed && "animate-badge-pulse"
                    )}
                    key={`avatar-badge-${badgePulseToken}`}
                  />
                </span>
              )}
              {hasUnreadNotifications && (
                <span className="sr-only">You have unread notifications</span>
              )}
            </span>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <HugeiconsIcon
              className="ml-auto size-4"
              icon={UnfoldMoreIcon}
              strokeWidth={2}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={NotificationIcon} strokeWidth={2} />
                  Notifications
                  {hasUnreadNotifications && (
                    <span className="fade-in-0 zoom-in-0 ml-auto inline-flex size-5 animate-in transition-all duration-150 ease-(--ease-out-expo)">
                      <span
                        className={cn(
                          "!text-white inline-flex size-full items-center justify-center rounded-full bg-destructive font-medium text-[10px]",
                          hasPulsed && "animate-badge-pulse"
                        )}
                        key={`menu-badge-${badgePulseToken}`}
                      >
                        {unreadCountLabel}
                      </span>
                    </span>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[calc(100vw-1rem)] p-0 sm:w-96 sm:max-w-none">
                  <div className="h-[min(400px,calc(100dvh-7rem))] w-full overflow-hidden sm:h-[400px]">
                    <Suspense>
                      <CourierInbox
                        darkTheme={COURIER_DARK_THEME}
                        height="100%"
                        lightTheme={COURIER_LIGHT_THEME}
                        mode={mode}
                        onMessageClick={({
                          message,
                        }: CourierInboxListItemFactoryProps) => {
                          const clickAction = (
                            message.data as { clickAction?: string } | undefined
                          )?.clickAction;
                          if (clickAction) {
                            setMenuOpen(false);
                            navigate({ to: clickAction });
                          }
                        }}
                      />
                    </Suspense>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => openSettings("profile")}>
                <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await zero.delete();
                } catch (error: unknown) {
                  log.error({
                    component: "NavUser",
                    action: "logout.clearCache",
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      invalidateAuthCache();
                      navigate({
                        to: "/",
                      });
                    },
                  },
                });
              }}
            >
              <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <SettingsDialog />
    </SidebarMenu>
  );
}
