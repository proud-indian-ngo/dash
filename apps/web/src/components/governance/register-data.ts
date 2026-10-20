import {
  DEED_VERSION_1,
  type DeedRules,
  deedVersionOn,
  type OfficeRow,
  type RegisterInput,
  type TermRow,
  type TrusteeRow,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { format } from "date-fns";

import { DATE } from "@/lib/date-formats";
import { isAwaitingResult } from "@/lib/zero-result";

/** Zero stores dates as epoch milliseconds at UTC midnight. */
export function epochToIso(value: number): string;
export function epochToIso(value: number | null | undefined): string | null;
export function epochToIso(value: number | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : new Date(value).toISOString().slice(0, 10);
}

/** A form's Date (local midnight) as yyyy-MM-dd. */
export function dateToIso(value: Date | null | undefined): string | null {
  return value ? format(value, "yyyy-MM-dd") : null;
}

/** yyyy-MM-dd as a local Date for a date picker. */
export function isoToDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "16 Mar 2019"; a dash for none. */
export function formatIso(value: string | null | undefined): string {
  const date = isoToDate(value);
  return date ? format(date, DATE) : "—";
}

export function todayIso(): string {
  return todayInKolkata();
}

type TrusteeQueryRow = ReturnType<typeof useTrusteeRows>[number];

function useTrusteeRows() {
  const [rows] = useQuery(queries.trustee.all());
  return rows;
}

export interface RegisterTrustee extends TrusteeRow {
  offices: (OfficeRow & { validityNote: string | null })[];
  terms: (TermRow & {
    acceptanceDocumentId: string | null;
    cessationBasis: string | null;
    validityNote: string | null;
  })[];
  userId: string | null;
}

function toRegisterTrustee(row: TrusteeQueryRow): RegisterTrustee {
  return {
    id: row.id,
    isCoFounder: row.isCoFounder ?? false,
    legalName: row.legalName,
    offices: row.offices.map((o) => ({
      endEvidenceDocumentId: o.endEvidenceDocumentId ?? null,
      endedOn: epochToIso(o.endedOn),
      id: o.id,
      office: o.office,
      startEvidenceDocumentId: o.startEvidenceDocumentId ?? null,
      startsOn: epochToIso(o.startsOn),
      trusteeId: o.trusteeId,
      validityNote: o.validityNote ?? null,
    })),
    terms: row.terms.map((t) => ({
      acceptanceDocumentId: t.acceptanceDocumentId ?? null,
      basis: t.basis,
      cessationBasis: t.cessationBasis ?? null,
      endEvidenceDocumentId: t.endEvidenceDocumentId ?? null,
      endedOn: epochToIso(t.endedOn),
      endsOn: epochToIso(t.endsOn),
      id: t.id,
      startEvidenceDocumentId: t.startEvidenceDocumentId ?? null,
      startsOn: epochToIso(t.startsOn),
      trusteeId: t.trusteeId,
      validityNote: t.validityNote ?? null,
    })),
    userId: row.userId ?? null,
  };
}

export interface DeedVersionView {
  documentId: string | null;
  documentTitle: string | null;
  effectiveFrom: string;
  id: string;
  number: number;
  rules: DeedRules;
  title: string;
}

type DeedVersionRow = ReturnType<typeof useDeedRows>[number];

function useDeedRows() {
  const [rows] = useQuery(queries.deedVersion.all());
  return rows;
}

/** A synced deed version row as the shared rules read it. */
export function toDeedVersionView(
  d: Omit<DeedVersionRow, "document"> & {
    document?: { title: string } | null;
  }
): DeedVersionView {
  return {
    documentId: d.documentId ?? null,
    documentTitle: d.document?.title ?? null,
    effectiveFrom: epochToIso(d.effectiveFrom),
    id: d.id,
    number: d.number,
    rules: {
      amendmentThreshold: d.amendmentThreshold ?? "two_thirds_in_office",
      castingVote: d.castingVote,
      circularIssuers: d.circularIssuers ?? [],
      coOptionMaxYears: d.coOptionMaxYears,
      electronicCirculation: d.electronicCirculation,
      maxTrustees: d.maxTrustees,
      minTrustees: d.minTrustees,
      noticeDays: d.noticeDays,
      quorumFloor: d.quorumFloor,
      quorumKind: d.quorumKind,
      quorumRequiredOffice: d.quorumRequiredOffice ?? null,
      quorumValue: d.quorumValue,
      videoCountsPresent: d.videoCountsPresent,
    },
    title: d.title,
  };
}

/** The register, deed versions and the rules in force on a date, from Zero. */
export function useRegister(on: string) {
  const [trusteeRows, trusteeResult] = useQuery(queries.trustee.all());
  const [deedRows, deedResult] = useQuery(queries.deedVersion.all());
  const trustees = trusteeRows.map(toRegisterTrustee);
  const deedVersions = deedRows.map(toDeedVersionView);
  const inForce = deedVersionOn(deedVersions, on);
  const input: RegisterInput<RegisterTrustee> = {
    offices: trustees.flatMap((t) => t.offices),
    rules: inForce?.rules ?? DEED_VERSION_1.rules,
    terms: trustees.flatMap((t) => t.terms),
    trustees,
  };
  const isLoading =
    (trusteeRows.length === 0 && isAwaitingResult(trusteeResult)) ||
    (deedRows.length === 0 && isAwaitingResult(deedResult));
  return { deedVersions, inForce, input, isLoading, trustees };
}

/** Vault documents for pickers and evidence links. */
export function useGovernanceDocuments() {
  const [rows, result] = useQuery(queries.governanceDocument.all());
  return {
    documents: rows.map((d) => ({
      datedOn: epochToIso(d.datedOn),
      id: d.id,
      kind: d.kind,
      title: d.title,
    })),
    isLoading: rows.length === 0 && isAwaitingResult(result),
  };
}
