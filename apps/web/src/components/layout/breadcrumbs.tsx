import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pi-dash/design-system/components/ui/breadcrumb";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Fragment } from "react";
import { useApp } from "@/context/app-context";
import { buildBreadcrumbs, getKalakritiCenterRoute } from "@/lib/breadcrumbs";

export function Breadcrumbs() {
  const { hasPermission, navItems } = useApp();
  const { pathname } = useLocation();
  const centerRoute = getKalakritiCenterRoute(pathname);
  const [editions] = useQuery(queries.kalakritiEdition.accessible(), {
    enabled: hasPermission("kalakriti.view") && centerRoute !== undefined,
  });
  const edition = editions.find(
    (candidate) => candidate.year === centerRoute?.year
  );
  const [centers] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition?.id ?? "" }),
    { enabled: centerRoute !== undefined && Boolean(edition) }
  );
  const centerName = centers.find(
    (center) => center.id === centerRoute?.centerId
  )?.name;
  const breadcrumbItems = buildBreadcrumbs(navItems, pathname, { centerName });

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
