import { Menu01Icon, QrCodeScanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useSidebar } from "@pi-dash/design-system/components/ui/sidebar";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { NavItem } from "@/components/layout/nav-main";
import { useActivePath } from "@/hooks/use-active-path";
import type { NavGroup } from "@/lib/nav-items";

const MAX_TABS = 4;

/** Focused task pages (forms, import wizards, a record in edit mode) own the bottom edge for their actions. */
const TASK_PATH = /\/(?:new|import)$/;

export function isTaskPage(pathname: string, search: unknown): boolean {
  const mode =
    typeof search === "object" && search !== null && "mode" in search
      ? search.mode
      : undefined;
  return TASK_PATH.test(pathname) || mode === "edit";
}

/**
 * The tab bar's destinations: the preferred URLs the person can open, in
 * order, then the rest of their nav in sidebar order, up to `max`.
 */
export function pickTabItems(
  groups: NavGroup[],
  preferredUrls: readonly string[],
  max = MAX_TABS
): NavItem[] {
  const items = groups.flatMap((group) => group.items);
  const preferred = preferredUrls.flatMap((url) => {
    const item = items.find((candidate) => candidate.url === url);
    return item ? [item] : [];
  });
  const rest = items.filter((item) => !preferred.includes(item));
  return [...preferred, ...rest].slice(0, max);
}

function TabContent({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: IconSvgElement;
  label: ReactNode;
}) {
  return (
    <>
      <span
        className={cn(
          "flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-150",
          active && "bg-sidebar-accent"
        )}
      >
        <HugeiconsIcon className="size-5" icon={icon} strokeWidth={2} />
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </>
  );
}

const TAB_CLASS =
  "text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-active:text-sidebar-accent-foreground";

/**
 * Phone navigation: up to four destinations from the person's nav, an
 * optional Scan action, and Menu, which opens the full sidebar drawer.
 */
export function MobileTabBar({
  groups,
  onScan,
  preferredUrls,
}: {
  groups: NavGroup[];
  onScan?: () => void;
  preferredUrls: readonly string[];
}) {
  const { openMobile, setOpenMobile } = useSidebar();
  const { pathname, search } = useLocation();
  const tabs = pickTabItems(groups, preferredUrls, onScan ? 3 : MAX_TABS);
  const activePath = useActivePath(
    groups.flatMap((group) =>
      group.items.map((item) => item.matchPath ?? item.url)
    )
  );
  const activeTab = tabs.find(
    (item) => activePath === (item.matchPath ?? item.url)
  );

  if (isTaskPage(pathname, search)) {
    return null;
  }

  return (
    <nav
      aria-label="Main"
      className="bg-background/95 supports-backdrop-filter:bg-background/85 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      data-slot="mobile-tab-bar"
    >
      <ul className="grid h-14 auto-cols-fr grid-flow-col">
        {tabs.map((item) => {
          const active = item === activeTab;
          return (
            <li key={item.url}>
              <Link
                aria-current={active ? "page" : undefined}
                className={TAB_CLASS}
                data-active={active || undefined}
                to={item.url}
              >
                <TabContent
                  active={active}
                  icon={item.icon ?? Menu01Icon}
                  label={item.shortTitle ?? item.title}
                />
              </Link>
            </li>
          );
        })}
        {onScan ? (
          <li>
            <button className={TAB_CLASS} onClick={onScan} type="button">
              <TabContent active={false} icon={QrCodeScanIcon} label="Scan" />
            </button>
          </li>
        ) : null}
        <li>
          <button
            aria-expanded={openMobile}
            className={TAB_CLASS}
            data-active={!activeTab || undefined}
            onClick={() => setOpenMobile(true)}
            type="button"
          >
            <TabContent active={!activeTab} icon={Menu01Icon} label="Menu" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
