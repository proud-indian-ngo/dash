import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router";
import { getKalakritiEditionAccess } from "@/functions/kalakriti-access";
import { resolveKalakritiAuditScope } from "@/lib/kalakriti-audit-policy";
import { canAccessKalakritiEntries } from "@/lib/kalakriti-entry-policy";
import { canAccessKalakritiStudents } from "@/lib/kalakriti-student-policy";

export const Route = createFileRoute("/_app/kalakriti/$year")({
  beforeLoad: async ({ params }) => {
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw notFound();
    }
    const access = await getKalakritiEditionAccess({
      data: { year },
    });
    if (!access) {
      throw notFound();
    }
    return { kalakritiEditionAccess: access };
  },
  component: KalakritiEditionLayout,
});

function KalakritiEditionLayout() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const canManageGuardians =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin");
  const canViewCompetitions =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some(
      (responsibility) =>
        responsibility === "edition_admin" ||
        responsibility === "overall_events_lead" ||
        responsibility === "competition_category_lead"
    );
  const canViewStudents = canAccessKalakritiStudents(access);
  const canViewEntries = canAccessKalakritiEntries(access);
  const canViewAudit = Boolean(resolveKalakritiAuditScope(access));

  return (
    <div className="app-container mx-auto w-full max-w-5xl px-2 py-6 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display font-semibold text-3xl tracking-tight">
              {edition.name}
            </h1>
            <Badge className="capitalize" variant="outline">
              {edition.lifecycle.replaceAll("_", " ")}
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            Edition workspace for {edition.year}
            {access.isGlobalAdmin
              ? " · Global administrator access"
              : ` · ${access.membership?.kind === "guardian" ? "Guardian" : "Volunteer"} access`}
          </p>
        </div>
        {access.isGlobalAdmin ? (
          <Button nativeButton={false} render={<Link to="/kalakriti/new" />}>
            Create Edition
          </Button>
        ) : null}
      </div>

      <nav
        aria-label="Kalakriti Edition"
        className="mt-6 flex flex-wrap gap-2 border-b pb-3"
      >
        <Button
          nativeButton={false}
          render={
            <Link
              activeOptions={{ exact: true }}
              params={{ year: String(edition.year) }}
              to="/kalakriti/$year"
            />
          }
          size="sm"
          variant="ghost"
        >
          Overview
        </Button>
        <Button
          nativeButton={false}
          render={
            <Link
              params={{ year: String(edition.year) }}
              to="/kalakriti/$year/centers"
            />
          }
          size="sm"
          variant="ghost"
        >
          Centers
        </Button>
        {canManageGuardians ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/eligibility"
              />
            }
            size="sm"
            variant="ghost"
          >
            Eligibility
          </Button>
        ) : null}
        {canViewCompetitions ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/competitions"
              />
            }
            size="sm"
            variant="ghost"
          >
            Competitions
          </Button>
        ) : null}
        {canManageGuardians ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/guardians"
              />
            }
            size="sm"
            variant="ghost"
          >
            Guardians
          </Button>
        ) : null}
        {canViewStudents ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/students"
              />
            }
            size="sm"
            variant="ghost"
          >
            Students
          </Button>
        ) : null}
        {canViewEntries ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/entries"
              />
            }
            size="sm"
            variant="ghost"
          >
            Entries
          </Button>
        ) : null}
        {canViewAudit ? (
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ year: String(edition.year) }}
                to="/kalakriti/$year/audit"
              />
            }
            size="sm"
            variant="ghost"
          >
            Audit
          </Button>
        ) : null}
      </nav>

      <Outlet />
    </div>
  );
}
