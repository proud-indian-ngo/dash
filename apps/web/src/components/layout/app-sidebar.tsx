import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@pi-dash/design-system/components/ui/sidebar";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useLocation } from "@tanstack/react-router";
import type * as React from "react";
import { NavUser } from "@/components/layout/nav-user";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { useApp } from "@/context/app-context";
import { kalakritiNavGroups, shouldUseKalakritiNav } from "@/lib/nav-items";
import { NavMainGrouped } from "./nav-main";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission, navGroups, user } = useApp();
  const { pathname } = useLocation();
  const canViewKalakriti = hasPermission("kalakriti.view");
  const [editions] = useQuery(queries.kalakritiEdition.accessible(), {
    enabled: canViewKalakriti,
  });
  const showKalakriti = hasPermission("kalakriti.admin") || editions.length > 0;
  let visibleNavGroups = kalakritiNavGroups;

  if (!shouldUseKalakritiNav(pathname, user.role)) {
    visibleNavGroups = navGroups;

    if (!showKalakriti) {
      visibleNavGroups = navGroups.flatMap((group) => {
        const items = group.items.filter((item) => item.title !== "Kalakriti");
        return items.length > 0 ? [{ ...group, items }] : [];
      });
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMainGrouped groups={visibleNavGroups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
