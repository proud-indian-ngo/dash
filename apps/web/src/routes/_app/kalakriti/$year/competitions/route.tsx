import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { canAccessKalakritiEntries } from "@/lib/kalakriti-entry-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/competitions")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (access.edition.lifecycle === "archived" && !access.isGlobalAdmin) {
      throw notFound();
    }
    if (!canAccessKalakritiEntries(access)) throw notFound();
    const responsibilities = access.membership?.responsibilities ?? [];
    const actorCanManage =
      access.isGlobalAdmin ||
      responsibilities.includes("edition_admin") ||
      responsibilities.includes("overall_events_lead");
    const canViewConfiguration =
      actorCanManage || responsibilities.includes("competition_category_lead");
    const structuralLocked = [
      "registration_locked",
      "live",
      "archived",
    ].includes(access.edition.lifecycle);
    return {
      kalakritiCompetitionAccess: {
        actorCanManage,
        canViewConfiguration,
        canManage: actorCanManage && !structuralLocked,
        canEditCompetition:
          actorCanManage && access.edition.lifecycle !== "archived",
        canEditSchedule:
          actorCanManage &&
          !["live", "archived"].includes(access.edition.lifecycle),
        canManageCancellations:
          actorCanManage && access.edition.lifecycle !== "archived",
        configurationLocked: structuralLocked,
        structuralLocked,
      },
    };
  },
  component: Outlet,
});
