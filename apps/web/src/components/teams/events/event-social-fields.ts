import { normalizeEventPartner } from "@pi-dash/shared/social-recap";

import {
  type PartnerFormValue,
  toPartnerMutatorArgs,
} from "./event-partners-field";

interface SocialFormValues {
  partners: readonly PartnerFormValue[];
  volunteersNeeded: string;
}

/** What the edit form was prefilled with, including inherited values. */
export interface SocialFieldsInitial {
  partners?: readonly {
    instagram?: string | null;
    linkedin?: string | null;
    name: string;
  }[];
  volunteersNeeded?: number | null;
}

const partnersKey = (
  partners: readonly {
    instagram?: string | null;
    linkedin?: string | null;
    name: string;
  }[]
) =>
  JSON.stringify(
    partners.map((partner) => {
      const { instagram, linkedin, name } = normalizeEventPartner(partner);
      return [name, instagram, linkedin];
    })
  );

/**
 * Volunteer target and partners for the row the mutation writes. With
 * `omitUnchanged` (a single occurrence or an exception), a field equal to
 * its prefilled, possibly inherited, value is left out, so the row keeps
 * inheriting it from the series instead of forking a copy.
 */
export function buildSocialFields(
  value: SocialFormValues,
  options: { initial?: SocialFieldsInitial; omitUnchanged?: boolean } = {}
): {
  partners?: ReturnType<typeof toPartnerMutatorArgs>;
  volunteersNeeded?: number | null;
} {
  const needed = value.volunteersNeeded.trim();
  const volunteersNeeded = needed ? Number(needed) : null;
  const partners = toPartnerMutatorArgs(value.partners);
  if (!options.omitUnchanged) {
    return { partners, volunteersNeeded };
  }
  const initial = options.initial ?? {};
  return {
    ...(partnersKey(partners) === partnersKey(initial.partners ?? [])
      ? {}
      : { partners }),
    ...(volunteersNeeded === (initial.volunteersNeeded ?? null)
      ? {}
      : { volunteersNeeded }),
  };
}

/**
 * Where the social recap lives: a single past, non-cancelled session. A
 * series parent viewed as itself is its first session. A past virtual
 * occurrence shows "Start recap" when the viewer can materialise it
 * (events.edit or team lead), or when its exception row already exists, in
 * which case the button opens that row.
 */
export function deriveSocialRecapMode(input: {
  canManageAttendance: boolean;
  canMaterialize: boolean;
  event: {
    cancelledAt: number | null;
    recurrenceRule: unknown;
    seriesId: string | null;
  };
  existingOccurrenceId: string | undefined;
  isPastEvent: boolean;
  isVirtualOccurrence: boolean;
}): "form" | "materialize" | null {
  const { event } = input;
  if (!(input.canManageAttendance && input.isPastEvent) || event.cancelledAt) {
    return null;
  }
  if (input.isVirtualOccurrence) {
    return input.canMaterialize || input.existingOccurrenceId
      ? "materialize"
      : null;
  }
  return "form";
}

/**
 * How the Volunteers tab handles attendance once a session has started:
 * "mark" on a saved row (a series parent viewed as itself is its first
 * session), "open" on a virtual occurrence, whose marks need its own row
 * (materialised, or the existing one opened), "locked" there when the
 * viewer can mark attendance but not open the session, else nothing.
 */
export function deriveAttendanceMode(input: {
  canManageAttendance: boolean;
  canMaterialize: boolean;
  cancelled: boolean;
  existingOccurrenceId: string | undefined;
  hasStarted: boolean;
  isVirtualOccurrence: boolean;
}): "mark" | "open" | "locked" | null {
  if (!(input.canManageAttendance && input.hasStarted)) {
    return null;
  }
  if (!input.isVirtualOccurrence) {
    return "mark";
  }
  if (input.cancelled) {
    return null;
  }
  return input.canMaterialize || input.existingOccurrenceId ? "open" : "locked";
}
