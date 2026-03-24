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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@pi-dash/design-system/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
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
  return (
    <Collapsible className="group/collapsible" open={activePath === item.url}>
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-current={activePath === item.url ? "page" : undefined}
          isActive={activePath === item.url}
          render={<Link to={item.url} />}
          tooltip={item.title}
        >
          {item.icon && <HugeiconsIcon icon={item.icon} strokeWidth={2} />}
          <span>{item.title}</span>
        </SidebarMenuButton>
        {item.subItems?.some((s) => !s.isHidden) && (
          <>
            <CollapsibleTrigger
              aria-label={`Toggle ${item.title} submenu`}
              render={
                <button className="ml-auto" type="button">
                  <HugeiconsIcon
                    className="transition-transform duration-200 group-data-open/collapsible:rotate-90"
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                  />
                </button>
              }
            />
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.subItems
                  ?.filter((s) => !s.isHidden)
                  .map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton render={<Link to={subItem.url} />}>
                        {subItem.title}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function NavMainGrouped({ groups }: { groups: NavGroup[] }) {
  const activePath = useActivePath();

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label ?? "default"}>
          {group.label ? (
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          ) : null}
          <SidebarMenu>
            {group.items.map((item) => (
              <NavMenuItem
                activePath={activePath}
                item={item}
                key={item.title}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
