export const KALAKRITI_EDITION_LIFECYCLES = [
  "draft",
  "registration_open",
  "registration_locked",
  "live",
  "archived",
] as const;

export type KalakritiEditionLifecycle =
  (typeof KALAKRITI_EDITION_LIFECYCLES)[number];

export const KALAKRITI_MEMBERSHIP_KINDS = ["volunteer", "guardian"] as const;

export type KalakritiMembershipKind =
  (typeof KALAKRITI_MEMBERSHIP_KINDS)[number];

export const KALAKRITI_MEMBERSHIP_STATES = ["active", "archived"] as const;

export type KalakritiMembershipState =
  (typeof KALAKRITI_MEMBERSHIP_STATES)[number];

export const KALAKRITI_TRANSPORT_STATUSES = [
  "planned",
  "arrived_at_center",
  "arrived_at_venue",
  "departed_venue",
  "completed",
] as const;

export type KalakritiTransportStatus =
  (typeof KALAKRITI_TRANSPORT_STATUSES)[number];

export const KALAKRITI_TRANSPORT_STATUS_LABELS = {
  arrived_at_center: "Arrived at Center",
  arrived_at_venue: "Arrived at venue",
  completed: "Completed",
  departed_venue: "Departed venue",
  planned: "Planned",
} satisfies Record<KalakritiTransportStatus, string>;

export const KALAKRITI_OPERATION_TYPES = [
  "pickup",
  "venue_departure",
  "drop_off",
  "volunteer_check_in",
  "breakfast",
  "lunch",
  "competition_attendance",
] as const;

export type KalakritiOperationType = (typeof KALAKRITI_OPERATION_TYPES)[number];

export const KALAKRITI_OPERATIONAL_TEAMS = [
  "food",
  "transport",
  "logistics",
  "awards",
  "venue",
  "hospitality",
  "media",
  "fundraising",
] as const;

export type KalakritiOperationalTeam =
  (typeof KALAKRITI_OPERATIONAL_TEAMS)[number];

export const KALAKRITI_ASSIGNMENT_SCOPES = [
  "edition",
  "center",
  "competition_category",
  "competition",
] as const;

export type KalakritiAssignmentScope =
  (typeof KALAKRITI_ASSIGNMENT_SCOPES)[number];

export const KALAKRITI_TIMEZONE = "Asia/Kolkata" as const;

export const KALAKRITI_EDITION_RESPONSIBILITIES = [
  "edition_admin",
  "volunteer_coordinator",
  "overall_events_lead",
  "competition_category_lead",
  "competition_coordinator",
  "competition_volunteer",
  "liaison",
  "liaison_lead",
  "center_liaison_lead",
  "liaison_volunteer",
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
  "liaison_lead",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiEditionScopedResponsibility =
  (typeof KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES)[number];

export const KALAKRITI_OPERATIONAL_LEAD_RESPONSIBILITIES = [
  "food_lead",
  "transport_lead",
  "logistics_lead",
  "awards_lead",
  "venue_lead",
  "hospitality_lead",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiOperationalLeadResponsibility =
  (typeof KALAKRITI_OPERATIONAL_LEAD_RESPONSIBILITIES)[number];

export const KALAKRITI_OPERATIONAL_MEMBER_RESPONSIBILITIES = [
  "food_member",
  "hospitality_member",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiOperationalMemberResponsibility =
  (typeof KALAKRITI_OPERATIONAL_MEMBER_RESPONSIBILITIES)[number];

export const KALAKRITI_VOLUNTEER_EDITION_ASSIGNMENT_RESPONSIBILITIES = [
  ...KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES,
  ...KALAKRITI_OPERATIONAL_LEAD_RESPONSIBILITIES,
  ...KALAKRITI_OPERATIONAL_MEMBER_RESPONSIBILITIES,
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiVolunteerEditionAssignmentResponsibility =
  (typeof KALAKRITI_VOLUNTEER_EDITION_ASSIGNMENT_RESPONSIBILITIES)[number];

export const KALAKRITI_LIAISON_RESPONSIBILITIES = [
  "liaison",
  "liaison_lead",
  "center_liaison_lead",
  "liaison_volunteer",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiLiaisonResponsibility =
  (typeof KALAKRITI_LIAISON_RESPONSIBILITIES)[number];

export const KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES = [
  "liaison",
  "center_liaison_lead",
  "liaison_volunteer",
] as const satisfies readonly KalakritiResponsibility[];

export const KALAKRITI_CENTER_VOLUNTEER_RESPONSIBILITIES = [
  "center_liaison_lead",
  "liaison_volunteer",
  "transport_coordinator",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiCenterVolunteerResponsibility =
  (typeof KALAKRITI_CENTER_VOLUNTEER_RESPONSIBILITIES)[number];

export const KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES = [
  "competition_category_lead",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiCompetitionCategoryScopedResponsibility =
  (typeof KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES)[number];

export const KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES = [
  "competition_coordinator",
  "competition_volunteer",
] as const satisfies readonly KalakritiResponsibility[];

export type KalakritiCompetitionScopedResponsibility =
  (typeof KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES)[number];

export const KALAKRITI_RESPONSIBILITY_LABELS = {
  awards_lead: "Awards Lead",
  awards_member: "Awards Member",
  center_liaison_lead: "Liaison Lead",
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
  liaison_lead: "Overall Liaison Lead",
  liaison_volunteer: "Liaison Volunteer",
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

export function isKalakritiLiaisonResponsibility(
  responsibility: string
): responsibility is KalakritiLiaisonResponsibility {
  return (KALAKRITI_LIAISON_RESPONSIBILITIES as readonly string[]).includes(
    responsibility
  );
}

export function membershipHasKalakritiLiaisonAccess(
  responsibilities: readonly string[]
): boolean {
  return responsibilities.some(isKalakritiLiaisonResponsibility);
}

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

export type KalakritiAssignmentScopeKind =
  | "center"
  | "competition"
  | "competition_category"
  | "edition";

export function getKalakritiResponsibilityScopeKind(
  responsibility: KalakritiResponsibility
): KalakritiAssignmentScopeKind {
  if (
    (
      KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly string[]
    ).includes(responsibility) ||
    responsibility === "transport_coordinator"
  ) {
    return "center";
  }
  if (
    (
      KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES as readonly string[]
    ).includes(responsibility)
  ) {
    return "competition_category";
  }
  if (
    (
      KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES as readonly string[]
    ).includes(responsibility)
  ) {
    return "competition";
  }
  return "edition";
}

export interface KalakritiResponsibilityGroup {
  label: string;
  responsibilities: readonly KalakritiResponsibility[];
}

export function buildKalakritiAssignableResponsibilityGroups(options: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  isGlobalAdmin: boolean;
}): KalakritiResponsibilityGroup[] {
  const { actorResponsibilities, isGlobalAdmin } = options;
  const canAssign = (responsibility: KalakritiResponsibility) =>
    isGlobalAdmin ||
    canManageKalakritiResponsibility(actorResponsibilities, responsibility);
  const groups: KalakritiResponsibilityGroup[] = [];

  const editionLeadership =
    KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES.filter(canAssign);
  if (editionLeadership.length > 0) {
    groups.push({
      label: "Edition leadership",
      responsibilities: editionLeadership,
    });
  }

  const operationalLeads =
    KALAKRITI_OPERATIONAL_LEAD_RESPONSIBILITIES.filter(canAssign);
  if (operationalLeads.length > 0) {
    groups.push({
      label: "Operational leads",
      responsibilities: operationalLeads,
    });
  }

  const operationalMembers =
    KALAKRITI_OPERATIONAL_MEMBER_RESPONSIBILITIES.filter(canAssign);
  if (operationalMembers.length > 0) {
    groups.push({
      label: "Operational members",
      responsibilities: operationalMembers,
    });
  }

  const competitionResponsibilities = [
    ...KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES,
    ...KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES,
  ].filter(canAssign);
  if (competitionResponsibilities.length > 0) {
    groups.push({
      label: "Competition",
      responsibilities: competitionResponsibilities,
    });
  }

  const centerResponsibilities =
    KALAKRITI_CENTER_VOLUNTEER_RESPONSIBILITIES.filter(canAssign);
  if (centerResponsibilities.length > 0) {
    groups.push({
      label: "Center",
      responsibilities: centerResponsibilities,
    });
  }

  return groups;
}

export function flattenKalakritiAssignableResponsibilities(
  groups: readonly KalakritiResponsibilityGroup[]
): KalakritiResponsibility[] {
  return groups.flatMap((group) => [...group.responsibilities]);
}

const KALAKRITI_UNASSIGNABLE_USER_ROLES = new Set([
  "external_user",
  "unoriented_volunteer",
]);

export function isKalakritiAssignableUserRole(
  role: string | null | undefined
): boolean {
  return (
    role !== null &&
    role !== undefined &&
    role !== "" &&
    !KALAKRITI_UNASSIGNABLE_USER_ROLES.has(role)
  );
}

function normalizeKalakritiName(name: string): {
  name: string;
  normalizedName: string;
} {
  const displayName = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  return {
    name: displayName,
    normalizedName: displayName.toLocaleLowerCase("en-IN"),
  };
}

export function normalizeKalakritiCenterName(name: string): {
  name: string;
  normalizedName: string;
} {
  return normalizeKalakritiName(name);
}

export interface KalakritiAgeCategoryRange {
  id: string;
  maximumAge: number;
  minimumAge: number;
  name: string;
}

export type KalakritiAgeCategoryDerivation =
  | {
      age: number;
      category: KalakritiAgeCategoryRange;
      eligible: true;
    }
  | {
      age: number | null;
      eligible: false;
      reason: "birth_after_cutoff" | "no_matching_category";
    };

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): {
  day: number;
  month: number;
  year: number;
} {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new Error("Date must use YYYY-MM-DD format");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date is invalid");
  }
  return { day, month, year };
}

export function deriveKalakritiAgeCategory(
  dateOfBirth: string,
  cutoffDate: string,
  categories: readonly KalakritiAgeCategoryRange[]
): KalakritiAgeCategoryDerivation {
  const birth = parseDateOnly(dateOfBirth);
  const cutoff = parseDateOnly(cutoffDate);
  const birthKey = birth.month * 100 + birth.day;
  const cutoffKey = cutoff.month * 100 + cutoff.day;
  const age = cutoff.year - birth.year - (cutoffKey < birthKey ? 1 : 0);
  if (age < 0) {
    return { age: null, eligible: false, reason: "birth_after_cutoff" };
  }
  const matches = categories.filter(
    (candidate) => candidate.minimumAge <= age && candidate.maximumAge >= age
  );
  if (matches.length > 1) {
    throw new Error("Age Category ranges overlap");
  }
  const [category] = matches;
  return category
    ? { age, category, eligible: true }
    : { age, eligible: false, reason: "no_matching_category" };
}

export function findKalakritiAgeCategoryOverlap(
  categories: readonly Pick<
    KalakritiAgeCategoryRange,
    "id" | "maximumAge" | "minimumAge" | "name"
  >[]
): [string, string] | null {
  const ordered = [...categories].sort(
    (left, right) => left.minimumAge - right.minimumAge
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && current.minimumAge <= previous.maximumAge) {
      return [previous.name, current.name];
    }
  }
  return null;
}

export function normalizeKalakritiAgeCategoryName(name: string): {
  name: string;
  normalizedName: string;
} {
  return normalizeKalakritiName(name);
}

export function normalizeKalakritiStudentName(name: string): {
  name: string;
  normalizedName: string;
} {
  return normalizeKalakritiName(name);
}

export function formatKalakritiStudentHumanId(
  year: number,
  sequence: number
): string {
  if (!(Number.isInteger(year) && year >= 2000 && year <= 2200)) {
    throw new Error("Edition year is invalid");
  }
  if (!(Number.isInteger(sequence) && sequence > 0)) {
    throw new Error("Student sequence must be positive");
  }
  return `KAL-${year}-${String(sequence).padStart(4, "0")}`;
}

export function formatKalakritiVolunteerHumanId(
  year: number,
  sequence: number
): string {
  if (!(Number.isInteger(year) && year >= 2000 && year <= 2200)) {
    throw new Error("Edition year is invalid");
  }
  if (!(Number.isInteger(sequence) && sequence > 0)) {
    throw new Error("Volunteer sequence must be positive");
  }
  return `KALV-${year}-${String(sequence).padStart(4, "0")}`;
}

export function requireKalakritiAgeCategoryOverrideReason(
  reason: string
): string {
  const normalized = reason.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Age Category override reason is required");
  }
  if (normalized.length > 500) {
    throw new Error("Age Category override reason is too long");
  }
  return normalized;
}

export type KalakritiParticipationMode = "group" | "individual";
export type KalakritiGenderEligibility = "both" | "female" | "male";

export function normalizeKalakritiConfigurationName(name: string): {
  name: string;
  normalizedName: string;
} {
  return normalizeKalakritiName(name);
}

export function hasValidKalakritiGroupRules(
  participationMode: KalakritiParticipationMode,
  minimumGroupSize: number,
  maximumGroupSize: number
): boolean {
  return participationMode === "individual"
    ? minimumGroupSize === 1 && maximumGroupSize === 1
    : minimumGroupSize >= 2 && maximumGroupSize >= minimumGroupSize;
}

export interface KalakritiScheduleSession {
  cancelledAt: number | null;
  endAt: number;
  id: string;
  startAt: number;
  venueId: string;
}

export type KalakritiSessionScheduleValidation =
  | { valid: true }
  | {
      conflictSessionId?: string;
      reason: "invalid_time_range" | "outside_event_date" | "venue_overlap";
      valid: false;
    };

function dateInTimeZone(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateKalakritiSessionSchedule(
  candidate: KalakritiScheduleSession,
  eventDate: string,
  timeZone: string,
  sessions: readonly KalakritiScheduleSession[]
): KalakritiSessionScheduleValidation {
  if (
    !(Number.isFinite(candidate.startAt) && Number.isFinite(candidate.endAt)) ||
    candidate.endAt <= candidate.startAt
  ) {
    return { reason: "invalid_time_range", valid: false };
  }
  if (
    dateInTimeZone(candidate.startAt, timeZone) !== eventDate ||
    dateInTimeZone(candidate.endAt, timeZone) !== eventDate
  ) {
    return { reason: "outside_event_date", valid: false };
  }
  if (candidate.cancelledAt !== null) {
    return { valid: true };
  }
  const conflict = sessions.find(
    (session) =>
      session.id !== candidate.id &&
      session.cancelledAt === null &&
      session.venueId === candidate.venueId &&
      candidate.startAt < session.endAt &&
      session.startAt < candidate.endAt
  );
  return conflict
    ? {
        conflictSessionId: conflict.id,
        reason: "venue_overlap",
        valid: false,
      }
    : { valid: true };
}
