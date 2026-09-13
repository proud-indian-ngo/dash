import { createFileRoute, notFound } from "@tanstack/react-router";

import { AttendeeRosterPage } from "@/components/kalakriti/attendee-roster-page";
import { canViewKalakritiAttendees } from "@/lib/kalakriti-attendee-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/guests")({
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiAttendees(context.kalakritiEditionAccess, "guest"))
      throw notFound();
  },
  component: Page,
});
function Page() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  return (
    <AttendeeRosterPage key={access.edition.id} access={access} kind="guest" />
  );
}
