import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pi-dash/design-system/components/ui/breadcrumb";
import { Link, useLocation } from "@tanstack/react-router";
import { Fragment } from "react";
import type { NavItem } from "@/components/layout/nav-main";
import { useApp } from "@/context/app-context";

function buildNavItemsMap(items: NavItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[item.url] = item.title;
    if (item.subItems) {
      Object.assign(map, buildNavItemsMap(item.subItems));
    }
  }
  return map;
}

function resolveTitle(
  navItemsMap: Record<string, string>,
  path: string
): string | undefined {
  if (navItemsMap[path]) {
    return navItemsMap[path];
  }
  // Replace last segment with $id for dynamic route matching
  const segments = path.split("/");
  segments[segments.length - 1] = "$id";
  const patternPath = segments.join("/");
  return navItemsMap[patternPath];
}

export function Breadcrumbs() {
  const { navItems } = useApp();
  const navItemsMap = buildNavItemsMap(navItems);
  const { pathname } = useLocation();
  const pathnames = pathname.split("/").slice(1);

  const breadcrumbItems =
    pathname === "/"
      ? []
      : pathnames.reduce<{ path: string; title: string }[]>(
          (acc, _segment, index) => {
            const currentPath = `/${pathnames.slice(0, index + 1).join("/")}`;
            const title = resolveTitle(navItemsMap, currentPath);
            if (title) {
              acc.push({ path: currentPath, title });
            }
            return acc;
          },
          []
        );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink render={<Link to="/">Dashboard</Link>} />
        </BreadcrumbItem>
        {breadcrumbItems.map(({ path, title }, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          return (
            <Fragment key={path}>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={path}>{title}</Link>} />
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
