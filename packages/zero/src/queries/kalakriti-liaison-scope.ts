import { KALAKRITI_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";

export function buildKalakritiLiaisonResponsibilityOr<T>(
  or: (...conditions: T[]) => T,
  cmp: (field: "responsibility", value: string) => T
) {
  return or(
    ...KALAKRITI_LIAISON_RESPONSIBILITIES.map((responsibility) =>
      cmp("responsibility", responsibility)
    )
  );
}
