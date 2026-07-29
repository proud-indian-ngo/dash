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
import {
  buildBreadcrumbs,
  getKalakritiCenterRoute,
  getKalakritiEntrySessionRoute,
} from "@/lib/breadcrumbs";

export function Breadcrumbs() {
  const { hasPermission, navItems } = useApp();
  const { pathname, searchStr } = useLocation();
  const centerRoute = getKalakritiCenterRoute(pathname);
  const entrySessionRoute = getKalakritiEntrySessionRoute(pathname);
  const routeYear = (centerRoute ?? entrySessionRoute)?.year;
  const [editions] = useQuery(queries.kalakritiEdition.accessible(), {
    enabled: hasPermission("kalakriti.view") && routeYear !== undefined,
  });
  const edition = editions.find((candidate) => candidate.year === routeYear);
  const [centers] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition?.id ?? "" }),
    {
      enabled:
        (centerRoute !== undefined || entrySessionRoute !== undefined) &&
        Boolean(edition),
    }
  );
  const centerName = centers.find(
    (center) => center.id === centerRoute?.centerId
  )?.name;
  const requestedCenterId = new URLSearchParams(searchStr).get("center");
  const entryCenterId = centers.some(
    (center) => center.id === requestedCenterId
  )
    ? requestedCenterId
    : centers[0]?.id;
  const [sessions] = useQuery(
    queries.kalakritiEntry.availableSessionsByCenter({
      centerId: entryCenterId ?? "",
      editionId: edition?.id ?? "",
    }),
    {
      enabled:
        entrySessionRoute !== undefined &&
        Boolean(edition) &&
        Boolean(entryCenterId),
    }
  );
  const breadcrumbSession = sessions.find(
    (session) => session.id === entrySessionRoute?.sessionId
  );
  const sessionTitle =
    breadcrumbSession?.competition && breadcrumbSession.ageCategory
      ? `${breadcrumbSession.competition.name} · ${breadcrumbSession.ageCategory.name}`
      : undefined;
  const breadcrumbItems = buildBreadcrumbs(navItems, pathname, {
    centerName,
    sessionTitle,
  });

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
