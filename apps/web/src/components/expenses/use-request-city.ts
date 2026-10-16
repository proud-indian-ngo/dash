import { useCostCentres } from "@/hooks/use-cost-centres";

interface RequestCityInitial {
  costCentreId?: string | null;
  eventId?: string | null;
}

/**
 * "City" on the request forms. A request on an event takes the event's city
 * (no picker, like Programme); without one it is picked, from the active
 * cost centres, plus the request's own centre when an old one is inactive.
 * With a single choice the picker is hidden and that centre is used.
 */
export function useRequestCity(
  initial: RequestCityInitial | undefined,
  isEdit: boolean
) {
  const costCentres = useCostCentres();
  const cityOptions = costCentres.pickerOptions(
    isEdit ? initial?.costCentreId : null
  );
  const initialId = initial?.costCentreId;
  const defaultCostCentreId =
    (initialId && cityOptions.some((o) => o.value === initialId)
      ? initialId
      : costCentres.defaultId) ?? undefined;
  const activeIds = new Set(costCentres.active.map((c) => c.id));
  /**
   * Events a request may be linked to: any city's, except those of an
   * inactive cost centre, unless the request is already on it.
   */
  const listsEvent = (event: { costCentreId: string | null; id: string }) =>
    !(costCentres.loaded && event.costCentreId) ||
    activeIds.has(event.costCentreId) ||
    event.id === initial?.eventId;
  return { cityOptions, defaultCostCentreId, listsEvent };
}
