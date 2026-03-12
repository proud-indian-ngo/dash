import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@pi-dash/design-system/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
import { useActivePath } from "@/hooks/use-active-path";

export interface NavItem {
  icon?: IconSvgElement;
  isHidden?: boolean;
  subItems?: NavItem[];
  title: string;
  url: string;
}

export function NavMain({ items }: { items: NavItem[] }) {
  const activePath = useActivePath();

  return (
    <SidebarGroup>
      {/*<SidebarGroupLabel>Platform</SidebarGroupLabel>*/}
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            className="group/collapsible"
            key={item.title}
            open={activePath === item.url}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activePath === item.url}
                tooltip={item.title}
              >
                <Link
                  aria-current={activePath === item.url ? "page" : undefined}
                  className="flex items-center gap-2"
                  to={item.url}
                >
                  {item.icon && (
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                  )}
                  <span>{item.title}</span>
                </Link>
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
                            <SidebarMenuSubButton>
                              <Link
                                className="flex items-center gap-2"
                                to={subItem.url}
                              >
                                {subItem.title}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              )}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
