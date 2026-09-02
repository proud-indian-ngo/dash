import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@pi-dash/design-system/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";

import { useActivePath } from "@/hooks/use-active-path";
import type { NavGroup } from "@/lib/nav-items";

export interface NavItem {
  icon?: IconSvgElement;
  isHidden?: boolean;
  subItems?: NavItem[];
  title: string;
  url: string;
}

function NavMenuItem({
  item,
  activePath,
}: {
  activePath: string;
  item: NavItem;
}) {
  const { pathname } = useLocation();
  const isActive = activePath === item.url;
  const [submenuOpen, setSubmenuOpen] = useState(isActive);

  return (
    <Collapsible
      className="group/collapsible"
      onOpenChange={setSubmenuOpen}
      open={submenuOpen}
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-current={pathname === item.url ? "page" : undefined}
          className={item.subItems ? "pr-8" : undefined}
          isActive={isActive}
          render={<Link to={item.url} />}
          tooltip={item.title}
        >
          {item.icon ? (
            <HugeiconsIcon icon={item.icon} strokeWidth={2} />
          ) : null}
          <span>{item.title}</span>
        </SidebarMenuButton>
        {item.subItems?.some((s) => !s.isHidden) && (
          <>
            <CollapsibleTrigger
              aria-label={`Toggle ${item.title} submenu`}
              render={
                <SidebarMenuAction type="button">
                  <HugeiconsIcon
                    className="transition-transform duration-200 group-data-open/collapsible:rotate-90"
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                  />
                </SidebarMenuAction>
              }
            />
            <CollapsibleContent>
              <SidebarMenuSub className="mt-1">
                {item.subItems.map((subItem) =>
                  subItem.isHidden ? null : (
                    <SidebarMenuSubItem key={subItem.url}>
                      <SidebarMenuSubButton
                        aria-current={
                          pathname === subItem.url ? "page" : undefined
                        }
                        className="data-active:font-medium"
                        isActive={pathname === subItem.url}
                        render={<Link to={subItem.url} />}
                      >
                        {subItem.title}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )
                )}
              </SidebarMenuSub>
            </CollapsibleContent>
          </>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function NavMainGrouped({ groups }: { groups: NavGroup[] }) {
  const activePath = useActivePath(
    groups.flatMap((group) => group.items.map((item) => item.url))
  );

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label ?? "primary"}>
          {group.label ? (
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          ) : null}
          <SidebarMenu>
            {group.items.map((item) => (
              <NavMenuItem
                activePath={activePath}
                item={item}
                key={`${item.url}:${activePath === item.url}`}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
