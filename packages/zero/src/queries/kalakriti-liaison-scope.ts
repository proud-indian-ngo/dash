import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";

export function buildKalakritiLiaisonResponsibilityOr<T>(
  or: (...conditions: T[]) => T,
  cmp: (field: "responsibility", value: string) => T
) {
  return or(
    ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.map((responsibility) =>
      cmp("responsibility", responsibility)
    )
  );
}
