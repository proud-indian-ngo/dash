import {
  activeCostCentres,
  costCentrePickerOptions,
  defaultCostCentreId,
  isActiveCostCentre,
} from "@pi-dash/shared/cost-centre";
import { queries } from "@pi-dash/zero/queries";
import type { CostCentre } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

export interface CostCentres {
  /** Active centres by name: what pickers and filters offer. */
  active: CostCentre[];
  all: readonly CostCentre[];
  /** The centre a new record takes without a choice (the only active one). */
  defaultId: string | null;
  /** Whether the centres have synced. */
  loaded: boolean;
  /** A centre's name ("Mumbai" stays on old records), or "" while loading. */
  nameOf: (id: string | null | undefined) => string;
  /**
   * Picker options for a record: the active centres, plus its own centre
   * when inactive. A picker with fewer than two options is hidden.
   */
  pickerOptions: (
    currentId?: string | null
  ) => { label: string; value: string }[];
}

/**
 * Cost centres ("City" to volunteers) from Zero. The table is small and
 * synced to every internal user, so labels are looked up here rather than
 * through a relationship on every request and event row.
 */
export function useCostCentres(): CostCentres {
  const [all, result] = useQuery(queries.costCentre.all());
  return useMemo(() => {
    const byId = new Map(all.map((c) => [c.id, c]));
    return {
      active: activeCostCentres(all),
      all,
      defaultId: defaultCostCentreId(all),
      loaded: result.type === "complete" || all.length > 0,
      nameOf: (id) => (id ? (byId.get(id)?.name ?? "") : ""),
      pickerOptions: (currentId) =>
        costCentrePickerOptions(all, currentId).map((c) => ({
          label: isActiveCostCentre(c) ? c.name : `${c.name} (inactive)`,
          value: c.id,
        })),
    };
  }, [all, result.type]);
}
