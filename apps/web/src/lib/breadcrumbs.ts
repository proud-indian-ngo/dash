import type { NavItem } from "@/components/layout/nav-main";

export interface BreadcrumbEntry {
  path: string;
  title: string;
}

interface BreadcrumbOptions {
  sessionTitle?: string;
}

const KALAKRITI_EDITION_PATH =
  /^\/kalakriti\/(\d{4})(?:\/(centers|competitions|eligibility|entries|guardians|students|settings)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/;

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
  { sessionTitle }: BreadcrumbOptions
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

  const [, year, section, entityId, nestedId] = match;
  const editionPath = `/kalakriti/${year}`;
  const items: BreadcrumbEntry[] = [
    { path: "/kalakriti", title: "Kalakriti" },
    { path: editionPath, title: `${year} Edition` },
  ];

  if (section === "centers") {
    const centersPath = `${editionPath}/centers`;
    items.push({ path: centersPath, title: "Centers" });
  } else if (section === "guardians") {
    items.push({ path: `${editionPath}/guardians`, title: "Guardians" });
  } else if (section === "eligibility") {
    items.push({ path: `${editionPath}/eligibility`, title: "Eligibility" });
  } else if (section === "entries") {
    const entriesPath = `${editionPath}/entries`;
    items.push({ path: entriesPath, title: "Entries" });
    if (entityId) {
      items.push({
        path: `${entriesPath}/${entityId}`,
        title: sessionTitle ?? "Session",
      });
    }
  } else if (section === "students") {
    items.push({ path: `${editionPath}/students`, title: "Students" });
  } else if (section === "competitions") {
    const competitionsPath = `${editionPath}/competitions`;
    items.push({ path: competitionsPath, title: "Competitions" });
    if (entityId === "sessions" && nestedId) {
      items.push({
        path: `${competitionsPath}/sessions/${nestedId}`,
        title: sessionTitle ?? "Session",
      });
    } else if (entityId) {
      const subsectionTitles: Record<string, string> = {
        catalog: "Competitions",
        categories: "Categories",
        schedule: "Schedule",
        venues: "Venues",
      };
      const title = subsectionTitles[entityId];
      if (title) {
        items.push({
          path: `${competitionsPath}/${entityId}`,
          title,
        });
      }
    }
  } else if (section === "settings") {
    const settingsPath = `${editionPath}/settings`;
    items.push({ path: settingsPath, title: "Settings" });
    if (entityId) {
      const subsectionTitles: Record<string, string> = {
        categories: "Categories",
        edition: "Edition",
        eligibility: "Eligibility",
        venues: "Venues",
      };
      const title = subsectionTitles[entityId];
      if (title) {
        items.push({ path: `${settingsPath}/${entityId}`, title });
      }
    }
  }

  return items;
}

export function getKalakritiEntrySessionRoute(
  pathname: string
): { sessionId: string; year: number } | undefined {
  const match = pathname.match(KALAKRITI_EDITION_PATH);
  if (
    !match ||
    (match[2] !== "entries" &&
      !(match[2] === "competitions" && match[3] === "sessions"))
  ) {
    return;
  }

  const sessionId = match[2] === "entries" ? match[3] : match[4];
  return sessionId ? { sessionId, year: Number(match[1]) } : undefined;
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
