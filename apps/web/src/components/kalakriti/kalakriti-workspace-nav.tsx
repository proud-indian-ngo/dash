import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useNavigate } from "@tanstack/react-router";

const COMPETITION_TABS = [
  { label: "Overview", to: "/kalakriti/$year/competitions", value: "overview" },
  {
    label: "Categories",
    to: "/kalakriti/$year/competitions/categories",
    value: "categories",
  },
  {
    label: "Competitions",
    to: "/kalakriti/$year/competitions/catalog",
    value: "catalog",
  },
  {
    label: "Venues",
    to: "/kalakriti/$year/competitions/venues",
    value: "venues",
  },
  {
    label: "Schedule",
    to: "/kalakriti/$year/competitions/schedule",
    value: "schedule",
  },
] as const;

type CompetitionTabValue = (typeof COMPETITION_TABS)[number]["value"];

function competitionTabFromPathname(pathname: string): CompetitionTabValue {
  if (pathname.endsWith("/categories")) {
    return "categories";
  }
  if (pathname.endsWith("/catalog")) {
    return "catalog";
  }
  if (pathname.endsWith("/venues")) {
    return "venues";
  }
  if (pathname.endsWith("/schedule")) {
    return "schedule";
  }
  return "overview";
}

export function KalakritiCompetitionNav({
  pathname,
  year,
}: {
  pathname: string;
  year: string;
}) {
  const navigate = useNavigate();
  const value = competitionTabFromPathname(pathname);
  const handleValueChange = useEventCallback(
    async (next: string | number | null) => {
      const tab = COMPETITION_TABS.find((item) => item.value === next);
      if (!tab) {
        return;
      }
      await navigate({
        params: { year },
        to: tab.to,
      });
    }
  );

  return (
    <Tabs className="gap-0" onValueChange={handleValueChange} value={value}>
      <TabsList className="h-10 min-h-10 w-full justify-start" variant="line">
        {COMPETITION_TABS.map((tab) => (
          <TabsTrigger
            className="flex-none px-3"
            key={tab.value}
            value={tab.value}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
