import {
  createFileRoute,
  notFound,
  Outlet,
  useLocation,
} from "@tanstack/react-router";

import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { KalakritiCompetitionNav } from "@/components/kalakriti/kalakriti-workspace-nav";

export const Route = createFileRoute("/_app/kalakriti/$year/competitions")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (access.edition.lifecycle === "archived" && !access.isGlobalAdmin) {
      throw notFound();
    }
    const responsibilities = access.membership?.responsibilities ?? [];
    const canView =
      access.isGlobalAdmin ||
      responsibilities.some(
        (responsibility) =>
          responsibility === "edition_admin" ||
          responsibility === "overall_events_lead" ||
          responsibility === "competition_category_lead"
      );
    if (!canView) {
      throw notFound();
    }

    const actorCanManage =
      access.isGlobalAdmin ||
      responsibilities.includes("edition_admin") ||
      responsibilities.includes("overall_events_lead");
    const fullyLocked =
      access.edition.lifecycle === "live" ||
      access.edition.lifecycle === "archived";
    const structuralLocked =
      access.edition.lifecycle === "registration_locked" || fullyLocked;

    return {
      kalakritiCompetitionAccess: {
        actorCanManage,
        canManage: actorCanManage && !structuralLocked,
        canManageCancellations: actorCanManage && !fullyLocked,
        configurationLocked: structuralLocked,
        structuralLocked,
      },
    };
  },
  component: KalakritiCompetitionsLayout,
});

function KalakritiCompetitionsLayout() {
  const { year } = Route.useParams();
  const { pathname } = useLocation();
  const { kalakritiEditionAccess } = Route.useRouteContext();

  return (
    <div className="space-y-6">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${kalakritiEditionAccess.edition.year}`}
        title="Competitions"
      />
      <KalakritiCompetitionNav pathname={pathname} year={year} />
      <Outlet />
    </div>
  );
}
