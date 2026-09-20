import { createFileRoute, notFound } from "@tanstack/react-router";

import { AwardsWorkspace } from "@/components/kalakriti/awards-workspace";
import { canViewKalakritiAwards } from "@/lib/kalakriti-awards-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/awards")({
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiAwards(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiAwardsPage,
});

function KalakritiAwardsPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  return <AwardsWorkspace access={access} />;
}
