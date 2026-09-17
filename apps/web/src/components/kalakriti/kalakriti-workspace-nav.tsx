import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useNavigate } from "@tanstack/react-router";

const SETTINGS_TABS = [
  {
    label: "Edition",
    to: "/kalakriti/$year/settings/edition",
    value: "edition",
    adminOnly: true,
  },
  {
    label: "Categories",
    to: "/kalakriti/$year/settings/categories",
    value: "categories",
    adminOnly: false,
  },
  {
    label: "Venues",
    to: "/kalakriti/$year/settings/venues",
    value: "venues",
    adminOnly: false,
  },
  {
    label: "Eligibility",
    to: "/kalakriti/$year/settings/eligibility",
    value: "eligibility",
    adminOnly: true,
  },
] as const;

export function KalakritiSettingsNav({
  canManageEdition,
  pathname,
  year,
}: {
  canManageEdition: boolean;
  pathname: string;
  year: string;
}) {
  const navigate = useNavigate();
  const value =
    SETTINGS_TABS.find((tab) => pathname.endsWith(`/${tab.value}`))?.value ??
    "categories";
  const handleValueChange = useEventCallback(
    async (next: string | number | null) => {
      const tab = SETTINGS_TABS.find((item) => item.value === next);
      if (!tab || (tab.adminOnly && !canManageEdition)) {
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
      <TabsList
        className="h-11 min-h-11 w-full justify-start overflow-x-auto overflow-y-hidden sm:h-10 sm:min-h-10"
        variant="line"
      >
        {SETTINGS_TABS.filter((tab) => !tab.adminOnly || canManageEdition).map(
          (tab) => (
            <TabsTrigger
              className="flex-none px-3 group-data-horizontal/tabs:after:bottom-0"
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </TabsTrigger>
          )
        )}
      </TabsList>
    </Tabs>
  );
}
