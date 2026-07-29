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
