import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@pi-dash/design-system/components/ui/sidebar";
import { membershipHasKalakritiLiaisonAccess } from "@pi-dash/shared/kalakriti";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useLocation } from "@tanstack/react-router";
import type * as React from "react";

import { NavUser } from "@/components/layout/nav-user";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { useApp } from "@/context/app-context";
import { canAccessKalakritiEventDay } from "@/lib/kalakriti-event-day-policy";
import {
  buildKalakritiNavGroups,
  shouldUseKalakritiNav,
  withKalakritiNavItem,
} from "@/lib/nav-items";

import { NavMainGrouped } from "./nav-main";

const KALAKRITI_YEAR_PATH = /^\/kalakriti\/(\d{4})(?:\/|$)/;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission, navGroups, user } = useApp();
  const { pathname } = useLocation();
  const [editions] = useQuery(queries.kalakritiEdition.accessible());
  const showKalakriti = hasPermission("kalakriti.admin") || editions.length > 0;
  const routeYear = pathname.match(KALAKRITI_YEAR_PATH)?.[1];
  const activeEdition =
    editions.find((edition) => edition.year === Number(routeYear)) ??
    editions[0];
  const [membership] = useQuery(
    queries.kalakritiAssignment.myAccess({
      editionId: activeEdition?.id ?? "",
    }),
    { enabled: Boolean(activeEdition) }
  );
  const canManageEdition =
    hasPermission("kalakriti.admin") ||
    membership?.assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    ) === true;
  const canManageCredentials = canManageEdition;
  const canViewCompetitions =
    hasPermission("kalakriti.admin") ||
    (activeEdition?.lifecycle !== "archived" &&
      membership?.assignments.some((assignment) =>
        [
          "edition_admin",
          "overall_events_lead",
          "competition_category_lead",
        ].includes(assignment.responsibility)
      ) === true);
  const canViewStudents =
    hasPermission("kalakriti.admin") ||
    membership?.kind === "guardian" ||
    membership?.assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    ) === true ||
    membershipHasKalakritiLiaisonAccess(
      membership?.assignments.map((assignment) => assignment.responsibility) ??
        []
    );
  const canViewEntries =
    canViewStudents ||
    membership?.assignments.some((assignment) =>
      [
        "overall_events_lead",
        "competition_category_lead",
        "competition_coordinator",
      ].includes(assignment.responsibility)
    ) === true;
  const canManageVolunteers =
    hasPermission("kalakriti.admin") ||
    membership?.assignments.some((assignment) =>
      ["edition_admin", "volunteer_coordinator"].includes(
        assignment.responsibility
      )
    ) === true;
  const canViewAudit =
    hasPermission("kalakriti.admin") ||
    (activeEdition?.lifecycle !== "archived" &&
      membership?.assignments.some(
        (assignment) =>
          assignment.responsibility === "edition_admin" ||
          assignment.responsibility === "overall_events_lead" ||
          assignment.responsibility === "volunteer_coordinator" ||
          (assignment.responsibility === "competition_category_lead" &&
            Boolean(assignment.competitionCategoryId))
      ) === true);
  const canViewEventDay = canAccessKalakritiEventDay({
    isGlobalAdmin: hasPermission("kalakriti.admin"),
    membership: membership
      ? {
          assignments: membership.assignments.map((assignment) => ({
            centerId: assignment.centerId,
            competitionCategoryId: assignment.competitionCategoryId,
            competitionId: assignment.competitionId,
            responsibility: assignment.responsibility,
          })),
          id: membership.id,
          kind: membership.kind,
          responsibilities: membership.assignments.map(
            (assignment) => assignment.responsibility
          ),
        }
      : null,
  });
  let visibleNavGroups = buildKalakritiNavGroups({
    canManageCredentials,
    canManageEligibility: canManageEdition,
    canManageGuardians: canManageEdition,
    canManageVolunteers,
    canViewAudit,
    canViewCompetitions,
    canViewEntries,
    canViewEventDay,
    canViewStudents,
    year: activeEdition?.year,
  });

  if (!shouldUseKalakritiNav(pathname, user.role)) {
    visibleNavGroups = showKalakriti
      ? withKalakritiNavItem(navGroups)
      : navGroups.flatMap((group) => {
          const items = group.items.filter(
            (item) => item.title !== "Kalakriti"
          );
          return items.length > 0 ? [{ ...group, items }] : [];
        });
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMainGrouped groups={visibleNavGroups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
