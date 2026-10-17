import { Invoice01Icon } from "@hugeicons/core-free-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  type CostCentreRequest,
  requestCostCentreId,
} from "@pi-dash/shared/cost-centre";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { lazy, Suspense } from "react";

import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { OutcomesView } from "@/components/analytics/outcomes-view";
import { readSelectEquality } from "@/components/data-table/compile-filter-query";
import { selectDataTableView } from "@/components/data-table/data-table-view-tabs";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCards } from "@/components/stats/stats-cards";
import { useCostCentres } from "@/hooks/use-cost-centres";
import { LEGACY_CITY_FILTER_PARAM } from "@/lib/cost-centre-filter";
import {
  dateRangeSearchParams,
  filterByDateRange,
  resolveDateRange,
} from "@/lib/date-range";
import { assertPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";
import {
  computeApprovalTimeData,
  computeCategoryData,
  computeEventData,
  computeProgrammeData,
  computeSubmissionStats,
  computeSubmitterData,
  computeTrendData,
  computeVendorData,
} from "@/lib/stats";

const SubmissionTrendsChart = lazy(() =>
  import("@/components/analytics/submission-trends-chart").then((m) => ({
    default: m.SubmissionTrendsChart,
  }))
);
const CategoryBreakdownChart = lazy(() =>
  import("@/components/analytics/category-breakdown-chart").then((m) => ({
    default: m.CategoryBreakdownChart,
  }))
);
const TopSubmittersChart = lazy(() =>
  import("@/components/analytics/top-submitters-chart").then((m) => ({
    default: m.TopSubmittersChart,
  }))
);
const TopVendorsChart = lazy(() =>
  import("@/components/analytics/top-vendors-chart").then((m) => ({
    default: m.TopVendorsChart,
  }))
);
// Not "event-spending-chart": tracker blockers refuse any URL containing
// "/analytics/event", which broke this page in dev.
const EventSpendingChart = lazy(() =>
  import("@/components/analytics/spending-by-event-chart").then((m) => ({
    default: m.EventSpendingChart,
  }))
);
const ApprovalTimeChart = lazy(() =>
  import("@/components/analytics/approval-time-chart").then((m) => ({
    default: m.ApprovalTimeChart,
  }))
);
const ProgrammeSpendingChart = lazy(() =>
  import("@/components/analytics/spending-by-programme-chart").then((m) => ({
    default: m.ProgrammeSpendingChart,
  }))
);

export const Route = createFileRoute("/_app/analytics")({
  beforeLoad: ({ context }) => assertPermission(context, "requests.view_all"),
  component: AnalyticsPage,
  head: () => ({
    meta: [{ title: `Analytics | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.reimbursement.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.advancePayment.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.vendorPayment.all(),
      abortController.signal
    );
  },
});

const LEGACY_ANALYTICS_FILTER_PARAMS = [LEGACY_CITY_FILTER_PARAM] as const;
const ANALYTICS_TABS = ["spending", "outcomes"] as const;

function AnalyticsPage() {
  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [vendorPayments, r3] = useQuery(queries.vendorPayment.all());

  const isLoading =
    reimbursements.length === 0 &&
    advancePayments.length === 0 &&
    vendorPayments.length === 0 &&
    r1.type !== "complete" &&
    r2.type !== "complete" &&
    r3.type !== "complete";

  const anyComplete =
    r1.type === "complete" || r2.type === "complete" || r3.type === "complete";

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(ANALYTICS_TABS).withDefault("spending")
  );
  const handleTabChange = useEventCallback((value: unknown) =>
    setTab(value as (typeof ANALYTICS_TABS)[number])
  );
  const [dateParams] = useQueryStates(dateRangeSearchParams);
  useMigrateLegacyFilterParams(LEGACY_ANALYTICS_FILTER_PARAMS);
  const { query, setQuery } = useDataTableFilters();
  const cityFilter = readSelectEquality(query, "city");
  const handleCityChange = useEventCallback((value: string | null) =>
    setQuery(selectDataTableView(query, "city", value === "all" ? null : value))
  );
  const dateRange = resolveDateRange(
    dateParams.range,
    dateParams.from,
    dateParams.to
  );

  const createdAtAccessor = (item: { createdAt: number | null }) =>
    item.createdAt;

  // Offered only with several active cost centres; the filter holds one's id.
  const costCentres = useCostCentres();
  const hasMultipleCities = costCentres.active.length > 1;
  const filterByCity = <T extends CostCentreRequest>(items: T[]): T[] => {
    if (!cityFilter) {
      return items;
    }
    // A request on an event counts under the event's city.
    return items.filter((item) => requestCostCentreId(item) === cityFilter);
  };

  const filteredReimbursements = filterByCity(
    filterByDateRange(reimbursements, dateRange, createdAtAccessor)
  );
  const filteredAdvancePayments = filterByCity(
    filterByDateRange(advancePayments, dateRange, createdAtAccessor)
  );
  const filteredVendorPayments = filterByCity(
    filterByDateRange(vendorPayments, dateRange, createdAtAccessor)
  );
  const allFiltered = [
    ...filteredReimbursements,
    ...filteredAdvancePayments,
    ...filteredVendorPayments,
  ];

  const stats = computeSubmissionStats(allFiltered, Invoice01Icon);
  // Zero query results include createdAt, lineItems.category, and user relations
  // which satisfy WithAnalyticsData, but the union of three query types doesn't overlap cleanly
  const analyticsData = allFiltered as unknown as Parameters<
    typeof computeTrendData
  >[0];
  const trendData = computeTrendData(
    analyticsData,
    dateRange.from,
    dateRange.to
  );
  const categoryData = computeCategoryData(analyticsData);
  const requestAnalyticsData = [
    ...filteredReimbursements,
    ...filteredAdvancePayments,
  ];
  const submitterData = computeSubmitterData(
    requestAnalyticsData as unknown as Parameters<
      typeof computeSubmitterData
    >[0]
  );
  const vendorData = computeVendorData(
    filteredVendorPayments as unknown as Parameters<typeof computeVendorData>[0]
  );
  const eventData = computeEventData(
    allFiltered as unknown as Parameters<typeof computeEventData>[0]
  );
  const programmeData = computeProgrammeData(
    allFiltered as unknown as Parameters<typeof computeProgrammeData>[0]
  );
  const approvalTimeData = computeApprovalTimeData(
    allFiltered as unknown as Parameters<typeof computeApprovalTimeData>[0]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {hasMultipleCities ? (
              <Select
                onValueChange={handleCityChange}
                value={cityFilter ?? "all"}
              >
                <SelectTrigger aria-label="City" className="h-8">
                  <SelectValue>
                    {costCentres.nameOf(cityFilter) || "All cities"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cities</SelectItem>
                  {costCentres.active.map((centre) => (
                    <SelectItem key={centre.id} value={centre.id}>
                      {centre.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <DateRangeFilter />
          </>
        }
        description={
          tab === "outcomes"
            ? "Children reached and volunteer time, from the events teams record."
            : "Where the money goes: requests, vendors and events over time."
        }
        title="Analytics"
      />

      <Tabs className="mt-4" onValueChange={handleTabChange} value={tab}>
        <TabsList>
          <TabsTrigger value="spending">Spending</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "outcomes" ? (
        <div className="mt-4">
          <OutcomesView
            costCentreId={cityFilter ?? null}
            dateRange={dateRange}
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <StatsCards isLoading={isLoading} items={stats} />
          </div>

          <Suspense
            fallback={
              <div className="mt-6 grid animate-pulse gap-4 lg:grid-cols-2">
                {["a", "b", "c", "d"].map((key) => (
                  <div className="bg-muted/50 h-80 rounded-xl" key={key} />
                ))}
              </div>
            }
          >
            {Boolean(anyComplete) && (
              <>
                <div className="mt-6 grid gap-4 *:min-w-0 lg:grid-cols-2">
                  <SubmissionTrendsChart data={trendData} />
                  <ApprovalTimeChart data={approvalTimeData} />
                  <ProgrammeSpendingChart data={programmeData} />
                  <CategoryBreakdownChart data={categoryData} />
                  <EventSpendingChart data={eventData} />
                  <TopSubmittersChart data={submitterData} />
                  <TopVendorsChart data={vendorData} />
                </div>
              </>
            )}
          </Suspense>
        </>
      )}
    </div>
  );
}
