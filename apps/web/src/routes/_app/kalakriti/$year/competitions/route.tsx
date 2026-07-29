import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

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
    const configurationLocked =
      access.edition.lifecycle === "live" ||
      access.edition.lifecycle === "archived";

    return {
      kalakritiCompetitionAccess: {
        actorCanManage,
        canManage: actorCanManage && !configurationLocked,
        configurationLocked,
      },
    };
  },
  component: Outlet,
});
