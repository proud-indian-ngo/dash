import { Invoice01Icon } from "@hugeicons/core-free-icons";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { lazy, Suspense } from "react";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { readSelectEquality } from "@/components/data-table/compile-filter-query";
import { DataTableFiltersBar } from "@/components/data-table/data-table-wrapper";
import {
  SELECT_IS_ONLY_OPERATORS,
  selectField,
} from "@/components/data-table/filter-fields";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import { StatsCards } from "@/components/stats/stats-cards";
import {
  dateRangeSearchParams,
  filterByDateRange,
  resolveDateRange,
} from "@/lib/date-range";
import { cityOptions } from "@/lib/form-schemas";
import { assertPermission } from "@/lib/route-guards";
import {
  computeApprovalTimeData,
  computeCategoryData,
  computeEventData,
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
const EventSpendingChart = lazy(() =>
  import("@/components/analytics/event-spending-chart").then((m) => ({
    default: m.EventSpendingChart,
  }))
);
const ApprovalTimeChart = lazy(() =>
  import("@/components/analytics/approval-time-chart").then((m) => ({
    default: m.ApprovalTimeChart,
  }))
);

export const Route = createFileRoute("/_app/analytics")({
  beforeLoad: ({ context }) => assertPermission(context, "requests.view_all"),
  component: AnalyticsPage,
  head: () => ({
    meta: [{ title: `Analytics | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.reimbursement.all());
    context.zero?.preload(queries.advancePayment.all());
    context.zero?.preload(queries.vendorPayment.all());
  },
});

const ANALYTICS_CITY_FILTER_FIELDS = [
  selectField("city", "City", cityOptions, SELECT_IS_ONLY_OPERATORS),
];
const LEGACY_ANALYTICS_FILTER_PARAMS = [
  { param: "city", path: "city" },
] as const;

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

  const [dateParams] = useQueryStates(dateRangeSearchParams);
  useMigrateLegacyFilterParams(LEGACY_ANALYTICS_FILTER_PARAMS);
  const { query, setQuery } = useDataTableFilters();
  const cityFilter = readSelectEquality(query, "city");
  const dateRange = resolveDateRange(
    dateParams.range,
    dateParams.from,
    dateParams.to
  );

  const createdAtAccessor = (item: { createdAt: number | null }) =>
    item.createdAt;

  const allCities = new Set(
    [...reimbursements, ...advancePayments, ...vendorPayments]
      .map((item) => (item as { city: string | null }).city)
      .filter(Boolean)
  );
  const hasMultipleCities = allCities.size > 1;

  const cityAccessor = (item: { city: string | null }) => item.city;
  const filterByCity = <T extends { city: string | null }>(items: T[]): T[] => {
    if (!cityFilter) {
      return items;
    }
    return items.filter((item) => cityAccessor(item) === cityFilter);
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
  const approvalTimeData = computeApprovalTimeData(
    allFiltered as unknown as Parameters<typeof computeApprovalTimeData>[0]
  );

  return (
    <div className="app-container fade-in-0 mx-auto max-w-7xl animate-in px-2 py-6 duration-150 ease-out-expo sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          Analytics
        </h1>
        <div className="flex items-center gap-2">
          {hasMultipleCities ? (
            <DataTableFiltersBar
              allowAdvanced={false}
              fields={ANALYTICS_CITY_FILTER_FIELDS}
              onQueryChange={setQuery}
              query={query}
            />
          ) : null}
          <DateRangeFilter />
        </div>
      </div>

      <div className="mt-4">
        <StatsCards isLoading={isLoading} items={stats} />
      </div>

      <Suspense
        fallback={
          <div className="mt-6 animate-pulse space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-95 rounded-none bg-muted/50" />
              <div className="h-95 rounded-none bg-muted/50" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-95 rounded-none bg-muted/50" />
              <div className="h-95 rounded-none bg-muted/50" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-95 rounded-none bg-muted/50" />
              <div className="h-95 rounded-none bg-muted/50" />
            </div>
          </div>
        }
      >
        {Boolean(anyComplete) && (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <SubmissionTrendsChart data={trendData} />
              <CategoryBreakdownChart data={categoryData} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <TopSubmittersChart data={submitterData} />
              <TopVendorsChart data={vendorData} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <EventSpendingChart data={eventData} />
              <ApprovalTimeChart data={approvalTimeData} />
            </div>
          </>
        )}
      </Suspense>
    </div>
  );
}
