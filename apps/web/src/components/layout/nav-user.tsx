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

// Mirrors design tokens from packages/design-system/styles.css (Courier API requires string values)
const PRIMARY_LIGHT = "oklch(0.55 0.15 210)";

// Dark mode palette — hex equivalents of app's OKLch dark theme tokens
// Courier web components may not parse OKLch strings, so we use hex.
const DARK = {
  primary: "#00a7b1", // oklch(0.65 0.14 200) → --primary
  bg: "#1d161e", // oklch(0.212 0.019 322.12) → --card
  border: "rgba(255,255,255,0.1)", // --border
  fg: "#FFFFFF", // --foreground
  mutedFg: "#a89ea9", // oklch(0.711 0.019 323.02) → --muted-foreground
  hover: "rgba(255,255,255,0.1)",
  active: "rgba(255,255,255,0.2)",
} as const;

function courierPrimaryTheme(primary: string): CourierInboxTheme {
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

const COURIER_LIGHT_THEME = courierPrimaryTheme(PRIMARY_LIGHT);

const COURIER_DARK_THEME: CourierInboxTheme = {
  inbox: {
    header: {
      backgroundColor: DARK.bg,
      border: `1px solid ${DARK.border}`,
      feeds: {
        button: {
          font: { color: DARK.fg },
          changeFeedIcon: { color: DARK.fg },
          selectedFeedIconColor: DARK.fg,
          hoverBackgroundColor: DARK.hover,
          activeBackgroundColor: DARK.active,
          unreadCountIndicator: { backgroundColor: DARK.primary },
        },
        menu: {
          backgroundColor: DARK.bg,
          border: `1px solid ${DARK.border}`,
          shadow: "0px 4px 12px 0px rgba(0,0,0,0.4)",
          list: {
            font: { color: DARK.fg },
            hoverBackgroundColor: DARK.hover,
            activeBackgroundColor: DARK.active,
            selectedIcon: { color: DARK.fg },
          },
        },
        tabs: {
          default: {
            font: { color: DARK.fg },
            hoverBackgroundColor: DARK.hover,
            activeBackgroundColor: DARK.active,
            unreadIndicator: { backgroundColor: DARK.hover },
          },
          selected: {
            font: { color: DARK.primary },
            indicatorColor: DARK.primary,
            hoverBackgroundColor: DARK.hover,
            activeBackgroundColor: DARK.active,
            unreadIndicator: { backgroundColor: DARK.primary },
          },
        },
      },
      tabs: {
        default: {
          font: { color: DARK.fg },
          hoverBackgroundColor: DARK.hover,
          activeBackgroundColor: DARK.active,
          unreadIndicator: { backgroundColor: DARK.hover },
        },
        selected: {
          font: { color: DARK.primary },
          indicatorColor: DARK.primary,
          hoverBackgroundColor: DARK.hover,
          activeBackgroundColor: DARK.active,
          unreadIndicator: { backgroundColor: DARK.primary },
        },
      },
      actions: {
        button: {
          icon: { color: DARK.fg },
          hoverBackgroundColor: DARK.hover,
          activeBackgroundColor: DARK.active,
        },
        markAllRead: { icon: { color: DARK.fg } },
        archiveAll: { icon: { color: DARK.fg } },
        archiveRead: { icon: { color: DARK.fg } },
        menu: {
          backgroundColor: DARK.bg,
          border: `1px solid ${DARK.border}`,
          shadow: "0px 4px 12px 0px rgba(0,0,0,0.4)",
          list: {
            font: { color: DARK.fg },
            hoverBackgroundColor: DARK.hover,
            activeBackgroundColor: DARK.active,
          },
        },
      },
    },
    list: {
      backgroundColor: DARK.bg,
      scrollbar: {
        trackBackgroundColor: "transparent",
        thumbColor: DARK.border,
        thumbHoverColor: DARK.border,
      },
      item: {
        unreadIndicatorColor: DARK.primary,
        hoverBackgroundColor: DARK.hover,
        activeBackgroundColor: DARK.active,
        title: { color: DARK.fg },
        subtitle: { color: DARK.mutedFg },
        subtitleLink: { color: DARK.primary },
        time: { color: DARK.mutedFg },
        divider: `1px solid ${DARK.border}`,
        actions: {
          border: `1px solid ${DARK.border}`,
          shadow: "0px 1px 2px 0px rgba(0,0,0,0.3)",
          font: { color: DARK.fg },
          hoverBackgroundColor: DARK.hover,
          activeBackgroundColor: DARK.active,
        },
        menu: {
          backgroundColor: DARK.bg,
          border: `1px solid ${DARK.border}`,
          shadow: "0px 4px 12px 0px rgba(0,0,0,0.4)",
          item: {
            hoverBackgroundColor: DARK.hover,
            activeBackgroundColor: DARK.active,
            read: { color: DARK.fg },
            unread: { color: DARK.fg },
            archive: { color: DARK.fg },
            unarchive: { color: DARK.fg },
          },
        },
      },
    },
    loading: {
      animation: { barColor: "#3d3440" },
      divider: `1px solid ${DARK.border}`,
    },
    empty: {
      title: { font: { color: DARK.fg } },
    },
    error: {
      title: { font: { color: DARK.fg } },
    },
  },
};

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
                  className="fade-in-0 zoom-in-0 absolute -top-0.5 -right-0.5 size-2.5 animate-in transition-all duration-150 ease-out-expo"
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
                    <span className="fade-in-0 zoom-in-0 ml-auto inline-flex size-5 animate-in transition-all duration-150 ease-out-expo">
                      <span
                        className={cn(
                          "inline-flex size-full items-center justify-center rounded-full bg-destructive font-medium text-[10px] text-white!",
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
                  <div className="h-[min(400px,calc(100dvh-7rem))] w-full overflow-hidden sm:h-100">
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
