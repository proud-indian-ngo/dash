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
import { useNavItems } from "@/hooks/use-nav-items";

export function Breadcrumbs() {
  const navItems = useNavItems();
  const navItemsMap = navItems.reduce(
    (acc, item) => {
      acc[item.url] = item.title;
      if (item.subItems) {
        for (const subItem of item.subItems) {
          acc[subItem.url] = subItem.title;
        }
      }
      return acc;
    },
    {} as Record<string, string>
  );
  const { pathname } = useLocation();
  const pathnames = pathname.split("/").slice(1);

  const breadcrumPaths = pathnames.reduce<string[]>((acc, _path, index) => {
    const currentPath = `/${pathnames.slice(0, index + 1).join("/")}`;

    if (navItemsMap[currentPath]) {
      acc.push(currentPath);
    }
    return acc;
  }, []);

  const breadcrumbItems =
    pathname === "/"
      ? []
      : breadcrumPaths.map((path, index) => {
          const isLast = index === breadcrumPaths.length - 1;

          return (
            <Fragment key={path}>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{navItemsMap[path]}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link to={path}>{navItemsMap[path]}</Link>}
                  />
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink render={<Link to="/">Dashboard</Link>} />
        </BreadcrumbItem>
        {...breadcrumbItems}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
