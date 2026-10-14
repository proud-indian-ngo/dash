import { env } from "@pi-dash/env/web";
import { INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import { queries } from "@pi-dash/zero/queries";
import { createFileRoute } from "@tanstack/react-router";

import { DonationsReturnPage } from "@/components/income/donations-return-page";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

/**
 * Filing readiness for the donations return (Form 113, formerly 10BD).
 * Anyone who can see Income can see it (managing implies seeing); the
 * export inside needs finance.view_sensitive.
 */
export const Route = createFileRoute("/_app/income/return")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...INCOME_PERMISSIONS),
  component: DonationsReturnPage,
  head: () => ({
    meta: [{ title: `Donations return | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.contribution.list(),
      abortController.signal
    );
  },
});
