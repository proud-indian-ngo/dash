import { COST_CENTRE_IDS } from "./constants";

/**
 * Cost centres (`cost_centre`): where work happens. Volunteers see one as
 * "City" (event form, request forms, tables, filters); Settings, the Books,
 * the CA workbook and finance views say "Cost centre". Inactive centres
 * (Mumbai, closed) are never offered anew, but old records keep theirs.
 */

export interface CostCentreLike {
  active?: boolean | null;
  code: string;
  id: string;
  name: string;
}

export interface CostCentreRequest {
  costCentreId?: string | null;
  event?: { costCentreId?: string | null } | null;
  eventId?: string | null;
}

/**
 * A request's cost centre: its event's when it has one (the request stores
 * none, so the two never drift), else its own. Null while the event has not
 * loaded, or on an older request that never recorded a city. Every place
 * that needs a request's cost centre goes through this rule, as programmes
 * go through `expenseProgrammeOf`.
 */
export function requestCostCentreId(request: CostCentreRequest): string | null {
  if (request.eventId) {
    return request.event?.costCentreId ?? null;
  }
  return request.costCentreId ?? null;
}

export const isActiveCostCentre = (centre: { active?: boolean | null }) =>
  centre.active !== false;

/** The centres a picker or filter may offer, by name. */
export function activeCostCentres<T extends CostCentreLike>(
  centres: readonly T[]
): T[] {
  return centres
    .filter(isActiveCostCentre)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Picker options: the active centres, plus the record's current centre when
 * it is inactive, so editing an old Mumbai record keeps Mumbai unless an
 * active one is picked.
 */
export function costCentrePickerOptions<T extends CostCentreLike>(
  centres: readonly T[],
  currentId?: string | null
): T[] {
  const active = activeCostCentres(centres);
  const current = currentId
    ? centres.find((c) => c.id === currentId && !isActiveCostCentre(c))
    : undefined;
  return current ? [...active, current] : active;
}

/**
 * The centre a new record takes without a choice: the only active one, or
 * null when there are several (the form then asks).
 */
export function defaultCostCentreId(
  centres: readonly CostCentreLike[]
): string | null {
  const active = centres.filter(isActiveCostCentre);
  return active.length === 1 ? (active[0]?.id ?? null) : null;
}

/**
 * Values the old `?city=` URL parameter and filters used, mapped to the
 * cost centre that replaced each.
 */
export const LEGACY_CITY_COST_CENTRE_IDS: Record<string, string> = {
  bangalore: COST_CENTRE_IDS.bangalore,
  mumbai: COST_CENTRE_IDS.mumbai,
};

/**
 * Deprecated `city` values the public events feed still accepts during the
 * website's switch to cost centre codes (`mumbai` is not one: its centre is
 * inactive, so it gets the 400 like any other inactive code).
 */
export const DEPRECATED_PUBLIC_CITY_ALIASES: Record<string, string> = {
  bangalore: "BLR",
  bengaluru: "BLR",
};

/** A requested feed city as a cost centre code: aliases resolved, upper-cased. */
export function normalisePublicCityCode(raw: string): string {
  const trimmed = raw.trim();
  return (
    DEPRECATED_PUBLIC_CITY_ALIASES[trimmed.toLowerCase()] ??
    trimmed.toUpperCase()
  );
}
