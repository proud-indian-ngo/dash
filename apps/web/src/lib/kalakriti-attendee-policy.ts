interface AttendeeAccess {
  isGlobalAdmin: boolean;
  edition?: { lifecycle: string };
  membership?: {
    kind?: "guardian" | "volunteer";
    assignments: readonly {
      responsibility: string;
      competitionCategoryId?: string | null;
      competitionId?: string | null;
    }[];
  } | null;
}

export function canManageKalakritiAttendees(
  access: AttendeeAccess | null | undefined,
  kind: "guest" | "judge"
): boolean {
  return Boolean(
    access &&
    access.edition?.lifecycle !== "archived" &&
    (access.isGlobalAdmin ||
      access.membership?.assignments.some(
        (assignment) =>
          assignment.responsibility === "edition_admin" ||
          (kind === "judge" &&
            access.membership?.kind === "volunteer" &&
            assignment.responsibility === "overall_events_lead") ||
          (kind === "guest" &&
            access.membership?.kind === "volunteer" &&
            assignment.responsibility === "hospitality_lead")
      ))
  );
}

export function canViewKalakritiAttendees(
  access: AttendeeAccess | null | undefined,
  kind: "guest" | "judge"
) {
  if (!access) return false;
  if (access.isGlobalAdmin) return true;
  if (access.edition?.lifecycle === "archived") return false;
  return (
    access.membership?.assignments.some(
      (a) =>
        a.responsibility === "edition_admin" ||
        a.responsibility === "volunteer_coordinator" ||
        (kind === "guest" &&
          access.membership?.kind === "volunteer" &&
          a.responsibility === "hospitality_lead") ||
        (kind === "judge" &&
          (a.responsibility === "overall_events_lead" ||
            (a.responsibility === "competition_category_lead" &&
              Boolean(a.competitionCategoryId)) ||
            (a.responsibility === "competition_coordinator" &&
              Boolean(a.competitionId))))
    ) ?? false
  );
}
