/**
 * Dashboard-side limits for the post-event social recap and event partners.
 * The social API (`social-api.ts`) reads the stored values; these rules keep
 * the lead's form and the Zero mutators in agreement.
 */

export const SOCIAL_NOTES_MAX_LENGTH = 280;
/** An event photo's caption, which the social API passes on. */
export const EVENT_PHOTO_CAPTION_MAX_LENGTH = 280;
export const CHILDREN_ATTENDED_MAX = 10_000;
export const VOLUNTEERS_NEEDED_MAX = 1000;
export const EVENT_PARTNERS_MAX = 6;
export const EVENT_PARTNER_NAME_MAX_LENGTH = 120;
export const EVENT_PARTNER_LINKEDIN_MAX_LENGTH = 200;
/** Display name of a social API bearer token (settings UI). */
export const SOCIAL_TOKEN_NAME_MAX_LENGTH = 80;

/** Instagram handle with or without the leading "@". */
export const INSTAGRAM_HANDLE_RE = /^@?[A-Za-z0-9._]{1,30}$/;
const LEADING_AT_RE = /^@+/;

export interface EventPartnerInput {
  instagram?: string | null;
  linkedin?: string | null;
  name: string;
}

export interface NormalizedEventPartner {
  instagram: string | null;
  linkedin: string | null;
  name: string;
}

/** Store Instagram handles with a single leading "@"; blank becomes null. */
export function normalizeInstagramHandle(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim().replace(LEADING_AT_RE, "") ?? "";
  return trimmed ? `@${trimmed}` : null;
}

/** Trim partner fields, dropping blank optional values. */
export function normalizeEventPartner(
  partner: EventPartnerInput
): NormalizedEventPartner {
  return {
    instagram: normalizeInstagramHandle(partner.instagram),
    linkedin: partner.linkedin?.trim() || null,
    name: partner.name.trim(),
  };
}
