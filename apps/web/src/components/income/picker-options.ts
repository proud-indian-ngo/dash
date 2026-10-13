import type { SelectOption } from "@/components/form/select-field";

/**
 * Pickers offer only active records, so the account, fund, programme, project
 * or giver an edited row already points at may be missing. Add it back,
 * marked "(inactive)", so the field shows a name instead of a raw ID.
 */
export function withCurrentOption(
  options: readonly SelectOption[],
  currentId: string | null | undefined,
  label: string | null | undefined
): SelectOption[] {
  if (!currentId || options.some((option) => option.value === currentId)) {
    return [...options];
  }
  return [
    ...options,
    { label: `${label ?? "Unknown"} (inactive)`, value: currentId },
  ];
}
