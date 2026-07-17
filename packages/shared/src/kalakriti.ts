export const KALAKRITI_EDITION_RESPONSIBILITIES = [
  "edition_admin",
  "volunteer_coordinator",
  "overall_events_lead",
  "competition_category_lead",
  "competition_coordinator",
  "competition_volunteer",
  "liaison",
  "food_lead",
  "food_member",
  "transport_lead",
  "transport_coordinator",
  "logistics_lead",
  "logistics_member",
  "awards_lead",
  "awards_member",
  "venue_lead",
  "venue_member",
  "hospitality_lead",
  "hospitality_member",
  "media_member",
  "fundraising_member",
] as const;

export type KalakritiResponsibility =
  (typeof KALAKRITI_EDITION_RESPONSIBILITIES)[number];

export const KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES = [
  "edition_admin",
  "volunteer_coordinator",
  "overall_events_lead",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiEditionScopedResponsibility =
  (typeof KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES)[number];

export const KALAKRITI_RESPONSIBILITY_LABELS = {
  awards_lead: "Awards Lead",
  awards_member: "Awards Member",
  competition_category_lead: "Competition Category Lead",
  competition_coordinator: "Competition Coordinator",
  competition_volunteer: "Competition Volunteer",
  edition_admin: "Edition Administrator",
  food_lead: "Food Lead",
  food_member: "Food Member",
  fundraising_member: "Fundraising Member",
  hospitality_lead: "Hospitality Lead",
  hospitality_member: "Hospitality Member",
  liaison: "Liaison",
  logistics_lead: "Logistics Lead",
  logistics_member: "Logistics Member",
  media_member: "Media Member",
  overall_events_lead: "Overall Events Lead",
  transport_coordinator: "Transport Coordinator",
  transport_lead: "Transport Lead",
  venue_lead: "Venue Lead",
  venue_member: "Venue Member",
  volunteer_coordinator: "Volunteer Coordinator",
} satisfies Record<KalakritiResponsibility, string>;

export function canManageKalakritiResponsibility(
  actorResponsibilities: readonly KalakritiResponsibility[],
  targetResponsibility: KalakritiResponsibility
): boolean {
  if (actorResponsibilities.includes("edition_admin")) {
    return true;
  }

  return (
    actorResponsibilities.includes("volunteer_coordinator") &&
    targetResponsibility !== "edition_admin" &&
    targetResponsibility !== "volunteer_coordinator"
  );
}
