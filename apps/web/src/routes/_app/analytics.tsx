import { Invoice01Icon } from "@hugeicons/core-free-icons";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { lazy, Suspense } from "react";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { StatsCards } from "@/components/stats/stats-cards";
import {
  dateRangeSearchParams,
  filterByDateRange,
  resolveDateRange,
} from "@/lib/date-range";
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
  head: () => ({
    meta: [{ title: `Analytics | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) => assertPermission(context, "requests.view_all"),
  loader: ({ context }) => {
    context.zero?.preload(queries.reimbursement.all());
    context.zero?.preload(queries.advancePayment.all());
    context.zero?.preload(queries.vendorPayment.all());
  },
  component: AnalyticsPage,
});

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
  const dateRange = resolveDateRange(
    dateParams.range,
    dateParams.from,
    dateParams.to
  );

  const createdAtAccessor = (item: { createdAt: number | null }) =>
    item.createdAt;
  const allFiltered = [
    ...filterByDateRange(reimbursements, dateRange, createdAtAccessor),
    ...filterByDateRange(advancePayments, dateRange, createdAtAccessor),
    ...filterByDateRange(vendorPayments, dateRange, createdAtAccessor),
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
  const submitterData = computeSubmitterData(analyticsData);
  const filteredVendorPayments = filterByDateRange(
    vendorPayments,
    dateRange,
    createdAtAccessor
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
    <div className="app-container fade-in-0 mx-auto max-w-7xl animate-in px-4 py-6 duration-150 ease-(--ease-out-expo)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          Analytics
        </h1>
        <DateRangeFilter />
      </div>

      <div className="mt-4">
        <StatsCards isLoading={isLoading} items={stats} />
      </div>

      <Suspense
        fallback={
          <div className="mt-6 animate-pulse space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-[380px] rounded-none bg-muted/50" />
              <div className="h-[380px] rounded-none bg-muted/50" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-[380px] rounded-none bg-muted/50" />
              <div className="h-[380px] rounded-none bg-muted/50" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-[380px] rounded-none bg-muted/50" />
              <div className="h-[380px] rounded-none bg-muted/50" />
            </div>
          </div>
        }
      >
        {anyComplete && (
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
