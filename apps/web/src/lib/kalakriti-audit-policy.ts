import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export const KALAKRITI_AUDIT_DOMAINS = [
  "edition",
  "center_configuration",
  "center_registration_controls",
  "guardian_center_assignment",
  "volunteer_assignment",
  "guardian_access",
  "age_category_configuration",
  "center_age_quota_configuration",
  "competition_configuration",
  "schedule_configuration",
  "student_registration",
  "entry_registration",
] as const;

export type KalakritiAuditDomain = (typeof KALAKRITI_AUDIT_DOMAINS)[number];

export function formatAuditLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface KalakritiAuditScope {
  categoryScopedDomains: KalakritiAuditDomain[];
  competitionCategoryIds: string[];
  domains: KalakritiAuditDomain[];
  fullEdition: boolean;
}

export function getKalakritiAuditViewKey(access: KalakritiEditionAccess) {
  const scope = resolveKalakritiAuditScope(access);
  return JSON.stringify({
    categoryScopedDomains: scope ? [...scope.categoryScopedDomains].sort() : [],
    competitionCategoryIds: scope
      ? [...scope.competitionCategoryIds].sort()
      : [],
    domains: scope ? [...scope.domains].sort() : [],
    editionId: access.edition.id,
    fullEdition: scope ? scope.fullEdition : false,
  });
}

export function resolveKalakritiAuditScope(
  access: KalakritiEditionAccess
): KalakritiAuditScope | null {
  if (access.isGlobalAdmin) {
    return {
      categoryScopedDomains: [],
      competitionCategoryIds: [],
      domains: [...KALAKRITI_AUDIT_DOMAINS],
      fullEdition: true,
    };
  }
  if (access.edition.lifecycle === "archived") {
    return null;
  }

  const { membership } = access;
  if (!membership) {
    return null;
  }
  if (membership.responsibilities.includes("edition_admin")) {
    return {
      categoryScopedDomains: [],
      competitionCategoryIds: [],
      domains: [...KALAKRITI_AUDIT_DOMAINS],
      fullEdition: true,
    };
  }

  const domains = new Set<KalakritiAuditDomain>();
  const unrestrictedDomains = new Set<KalakritiAuditDomain>();
  const competitionCategoryIds = new Set<string>();
  for (const assignment of membership.assignments) {
    if (assignment.responsibility === "overall_events_lead") {
      domains.add("competition_configuration");
      domains.add("schedule_configuration");
      unrestrictedDomains.add("competition_configuration");
      unrestrictedDomains.add("schedule_configuration");
    }
    if (assignment.responsibility === "volunteer_coordinator") {
      domains.add("volunteer_assignment");
      unrestrictedDomains.add("volunteer_assignment");
    }
    if (
      assignment.responsibility === "competition_category_lead" &&
      assignment.competitionCategoryId
    ) {
      domains.add("competition_configuration");
      domains.add("schedule_configuration");
      competitionCategoryIds.add(assignment.competitionCategoryId);
    }
  }

  if (domains.size === 0) {
    return null;
  }
  return {
    categoryScopedDomains: [...domains].filter(
      (domain) => !unrestrictedDomains.has(domain)
    ),
    competitionCategoryIds: [...competitionCategoryIds],
    domains: [...domains],
    fullEdition: false,
  };
}

const SAFE_AUDIT_METADATA_KEYS = new Set([
  "after",
  "ageCategoryId",
  "ageCategoryOverridden",
  "before",
  "centerId",
  "competitionCategoryId",
  "competitionCategoryIds",
  "competitionId",
  "competitionIds",
  "confirmReopen",
  "controls",
  "derivedAgeCategoryId",
  "duplicateConfirmed",
  "duplicateStudentId",
  "enabled",
  "from",
  "humanId",
  "kind",
  "lifecycle",
  "membershipId",
  "registrationEnabled",
  "responsibility",
  "sortOrder",
  "studentRegistrationEnabled",
  "targetMembershipId",
  "to",
  "venueId",
]);

const COMPETITION_IDENTIFIER_KEYS = new Set([
  "competitionId",
  "competitionIds",
]);
const OMIT_AUDIT_METADATA_VALUE = Symbol("omit-audit-metadata-value");

function sanitizeValue(
  value: unknown,
  allowedCompetitionCategoryIds: ReadonlySet<string> | null
): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(item, allowedCompetitionCategoryIds)
    );
  }
  if (typeof value !== "object") {
    return;
  }
  return sanitizeMetadata(
    value as Record<string, unknown>,
    allowedCompetitionCategoryIds
  );
}

function sanitizeMetadataValue(
  key: string,
  value: unknown,
  allowedCompetitionCategoryIds: ReadonlySet<string> | null
) {
  if (!allowedCompetitionCategoryIds) {
    return sanitizeValue(value, null);
  }
  if (COMPETITION_IDENTIFIER_KEYS.has(key)) {
    return OMIT_AUDIT_METADATA_VALUE;
  }
  if (key === "competitionCategoryId") {
    return typeof value === "string" && allowedCompetitionCategoryIds.has(value)
      ? value
      : OMIT_AUDIT_METADATA_VALUE;
  }
  if (key === "competitionCategoryIds") {
    if (!Array.isArray(value)) {
      return OMIT_AUDIT_METADATA_VALUE;
    }
    const categoryIds = value.filter(
      (categoryId): categoryId is string =>
        typeof categoryId === "string" &&
        allowedCompetitionCategoryIds.has(categoryId)
    );
    return categoryIds.length > 0 ? categoryIds : OMIT_AUDIT_METADATA_VALUE;
  }
  return sanitizeValue(value, allowedCompetitionCategoryIds);
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null,
  allowedCompetitionCategoryIds: ReadonlySet<string> | null
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_AUDIT_METADATA_KEYS.has(key)) {
      continue;
    }
    const safeValue = sanitizeMetadataValue(
      key,
      value,
      allowedCompetitionCategoryIds
    );
    if (safeValue === OMIT_AUDIT_METADATA_VALUE) {
      continue;
    }
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function sanitizeKalakritiAuditMetadata(
  metadata: Record<string, unknown> | null,
  allowedCompetitionCategoryIds?: readonly string[]
): Record<string, unknown> | null {
  return sanitizeMetadata(
    metadata,
    allowedCompetitionCategoryIds
      ? new Set(allowedCompetitionCategoryIds)
      : null
  );
}
