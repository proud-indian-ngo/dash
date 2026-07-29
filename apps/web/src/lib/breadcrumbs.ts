import type { NavItem } from "@/components/layout/nav-main";

export interface BreadcrumbEntry {
  path: string;
  title: string;
}

interface BreadcrumbOptions {
  centerName?: string;
}

const KALAKRITI_EDITION_PATH =
  /^\/kalakriti\/(\d{4})(?:\/(centers|competitions|eligibility|guardians)(?:\/([^/]+))?)?$/;

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

  const segments = path.split("/");
  segments[segments.length - 1] = "$id";
  return navItemsMap[segments.join("/")];
}

function buildKalakritiBreadcrumbs(
  pathname: string,
  { centerName }: BreadcrumbOptions
): BreadcrumbEntry[] | undefined {
  if (pathname === "/kalakriti/new") {
    return [
      { path: "/kalakriti", title: "Kalakriti" },
      { path: pathname, title: "New Edition" },
    ];
  }

  const match = pathname.match(KALAKRITI_EDITION_PATH);
  if (!match) {
    return;
  }

  const [, year, section, entityId] = match;
  const editionPath = `/kalakriti/${year}`;
  const items: BreadcrumbEntry[] = [
    { path: "/kalakriti", title: "Kalakriti" },
    { path: editionPath, title: `${year} Edition` },
  ];

  if (section === "centers") {
    const centersPath = `${editionPath}/centers`;
    items.push({ path: centersPath, title: "Centers" });
    if (entityId) {
      items.push({
        path: `${centersPath}/${entityId}`,
        title: centerName ?? "Center",
      });
    }
  } else if (section === "guardians") {
    items.push({ path: `${editionPath}/guardians`, title: "Guardians" });
  } else if (section === "eligibility") {
    items.push({ path: `${editionPath}/eligibility`, title: "Eligibility" });
  } else if (section === "competitions") {
    items.push({ path: `${editionPath}/competitions`, title: "Competitions" });
  }

  return items;
}

export function getKalakritiCenterRoute(
  pathname: string
): { centerId: string; year: number } | undefined {
  const match = pathname.match(KALAKRITI_EDITION_PATH);
  if (match?.[2] !== "centers" || !match[3]) {
    return;
  }

  return { centerId: match[3], year: Number(match[1]) };
}

export function buildBreadcrumbs(
  navItems: NavItem[],
  pathname: string,
  options: BreadcrumbOptions = {}
): BreadcrumbEntry[] {
  if (pathname === "/") {
    return [];
  }

  const kalakritiItems = buildKalakritiBreadcrumbs(pathname, options);
  if (kalakritiItems) {
    return kalakritiItems;
  }

  const navItemsMap = buildNavItemsMap(navItems);
  const pathnames = pathname.split("/").slice(1);
  return pathnames.reduce<BreadcrumbEntry[]>((items, _segment, index) => {
    const currentPath = `/${pathnames.slice(0, index + 1).join("/")}`;
    const title = resolveTitle(navItemsMap, currentPath);
    if (title) {
      items.push({ path: currentPath, title });
    }
    return items;
  }, []);
}
