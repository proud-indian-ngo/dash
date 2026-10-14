import type { ImportRowOutcome } from "@pi-dash/shared/constants";

import type { CellIssue, NormalizedRow } from "./normalize";

/**
 * Decides what each row of a batch would do, from its normalised values and
 * what already exists. Pure, so the review step and the import run use the
 * same rules and both can be unit-tested. Automatic decisions follow design
 * 3.9: an external identity seen before links or conflicts, an exact ID
 * number picks the donor, and email, phone or amount-and-date matches are
 * only proposals.
 */

export const REVIEW_CATEGORIES = [
  "ready",
  "new_donor",
  "needs_review",
  "conflict",
  "already_imported",
  "repeated_in_file",
  "error",
  "done",
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export type MatchReason = "email" | "id_number" | "phone";

export type DonorOption =
  | { kind: "existing"; name: string; partyId: string; reason: MatchReason }
  | {
      kind: "row";
      reason: Exclude<MatchReason, "id_number">;
      rowId: string;
      rowNumber: number;
    };

/** Who the contribution would belong to before any decision. */
export type DonorPlan =
  | { kind: "existing"; name: string; partyId: string }
  | { kind: "new"; key: string }
  | { kind: "undecided" };

export interface DuplicateRef {
  amountPaise: number;
  contributionId: string;
  reason: "reference" | "same_day_amount";
  receivedOn: string;
}

export interface ExistingIdentity {
  contributionId: string;
  payloadHash: string;
}

export interface ExistingContribution {
  amountPaise: number;
  id: string;
  partyId: string;
  receivedOn: string;
  reference: string | null;
}

export interface PartyRef {
  name: string;
  partyId: string;
}

export interface ClassifyRowInput {
  id: string;
  /** Identity key and payload hash, computed server-side; null for error rows. */
  identityKey: string | null;
  normalized: {
    errors: CellIssue[];
    row: NormalizedRow;
    warnings: CellIssue[];
  } | null;
  outcome: ImportRowOutcome;
  payloadHash: string | null;
  rowNumber: number;
}

export interface ClassifyContext {
  emailMatches: ReadonlyMap<string, readonly PartyRef[]>;
  existingContributions: readonly ExistingContribution[];
  identities: ReadonlyMap<string, ExistingIdentity>;
  /** Keyed by `idMatchKey`; only exact matches of a stored identifier. */
  idMatches: ReadonlyMap<string, readonly PartyRef[]>;
  phoneMatches: ReadonlyMap<string, readonly PartyRef[]>;
}

export interface ClassifiedRow {
  category: ReviewCategory;
  donor: DonorPlan;
  donorOptions: DonorOption[];
  duplicate: DuplicateRef | null;
  errors: CellIssue[];
  identityKey: string | null;
  /**
   * For already_imported, the contribution an earlier upload created; for
   * repeated_in_file, the earlier row of this file that creates it.
   */
  linkTo: { contributionId: string } | { rowId: string } | null;
  /** For repeated_in_file: the earlier row of this file it repeats. */
  repeatOf: { rowId: string; rowNumber: number } | null;
  rowId: string;
  rowNumber: number;
  /**
   * An earlier row of the file with the same ID number whose donor is still
   * to be chosen: this row gets whatever donor that row gets, so one ID
   * number never becomes two donors.
   */
  sameDonorAs: { rowId: string; rowNumber: number } | null;
  warnings: CellIssue[];
}

export const idMatchKey = (idType: string, idNumber: string) =>
  `${idType}:${idNumber}`;

function unique<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = keyOf(item);
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function findDuplicate(
  row: NormalizedRow,
  partyIds: readonly string[],
  existing: readonly ExistingContribution[]
): DuplicateRef | null {
  const reference = row.reference.toLowerCase();
  for (const c of existing) {
    if (reference && c.reference?.toLowerCase() === reference) {
      return {
        amountPaise: c.amountPaise,
        contributionId: c.id,
        reason: "reference",
        receivedOn: c.receivedOn,
      };
    }
  }
  for (const c of existing) {
    if (
      partyIds.includes(c.partyId) &&
      c.receivedOn === row.receivedOn &&
      c.amountPaise === row.amountPaise
    ) {
      return {
        amountPaise: c.amountPaise,
        contributionId: c.id,
        reason: "same_day_amount",
        receivedOn: c.receivedOn,
      };
    }
  }
  return null;
}

interface FileDonor {
  email: string;
  idKey: string | null;
  phone: string;
  rowId: string;
  rowNumber: number;
}

/** The first row of the file with an ID number, which later rows with it follow. */
interface FirstWithId {
  candidatePartyIds: string[];
  donor: DonorPlan;
  rowId: string;
  rowNumber: number;
}

export function classifyRows(
  rows: readonly ClassifyRowInput[],
  context: ClassifyContext
): ClassifiedRow[] {
  const seenIdentities = new Map<
    string,
    { hash: string; rowId: string; rowNumber: number }
  >();
  const firstById = new Map<string, FirstWithId>();
  const fileDonors: FileDonor[] = [];
  const ordered = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);

  return ordered.map((input): ClassifiedRow => {
    const base = {
      donor: { kind: "undecided" } as DonorPlan,
      donorOptions: [] as DonorOption[],
      duplicate: null,
      errors: input.normalized?.errors ?? [],
      identityKey: input.identityKey,
      linkTo: null,
      repeatOf: null,
      rowId: input.id,
      rowNumber: input.rowNumber,
      sameDonorAs: null,
      warnings: input.normalized?.warnings ?? [],
    };
    if (input.outcome === "imported" || input.outcome === "linked_existing") {
      if (input.identityKey && input.payloadHash) {
        seenIdentities.set(input.identityKey, {
          hash: input.payloadHash,
          rowId: input.id,
          rowNumber: input.rowNumber,
        });
      }
      return { ...base, category: "done" };
    }
    const normalized = input.normalized;
    if (
      !normalized ||
      normalized.errors.length > 0 ||
      !input.identityKey ||
      !input.payloadHash
    ) {
      return { ...base, category: "error" };
    }
    const { row } = normalized;

    const stored = context.identities.get(input.identityKey);
    if (stored) {
      return stored.payloadHash === input.payloadHash
        ? {
            ...base,
            category: "already_imported",
            linkTo: { contributionId: stored.contributionId },
          }
        : { ...base, category: "conflict" };
    }
    const earlier = seenIdentities.get(input.identityKey);
    if (earlier) {
      return earlier.hash === input.payloadHash
        ? {
            ...base,
            category: "repeated_in_file",
            linkTo: { rowId: earlier.rowId },
            repeatOf: { rowId: earlier.rowId, rowNumber: earlier.rowNumber },
          }
        : { ...base, category: "conflict" };
    }
    seenIdentities.set(input.identityKey, {
      hash: input.payloadHash,
      rowId: input.id,
      rowNumber: input.rowNumber,
    });

    const idKey =
      row.idType === "none" ? null : idMatchKey(row.idType, row.idNumber);
    const idParties = idKey ? (context.idMatches.get(idKey) ?? []) : [];
    const firstWithId = idKey ? firstById.get(idKey) : undefined;
    let donor: DonorPlan = { kind: "undecided" };
    let options: DonorOption[] = [];
    let sameDonorAs: ClassifiedRow["sameDonorAs"] = null;

    if (firstWithId) {
      // The ID number appeared earlier in the file: same person, same donor.
      if (firstWithId.donor.kind === "undecided") {
        sameDonorAs = {
          rowId: firstWithId.rowId,
          rowNumber: firstWithId.rowNumber,
        };
      } else {
        donor = firstWithId.donor;
      }
    } else if (idParties.length === 1 && idParties[0]) {
      donor = { kind: "existing", ...idParties[0] };
    } else if (idParties.length > 1) {
      // Two donors share the identifier: never pick one automatically.
      options = idParties.map((p) => ({
        kind: "existing" as const,
        ...p,
        reason: "id_number" as const,
      }));
    } else {
      const contactParties = [
        ...(row.email ? (context.emailMatches.get(row.email) ?? []) : []).map(
          (p) => ({ ...p, reason: "email" as const })
        ),
        ...(row.phone ? (context.phoneMatches.get(row.phone) ?? []) : []).map(
          (p) => ({ ...p, reason: "phone" as const })
        ),
      ];
      options = unique(contactParties, (p) => p.partyId).map((p) => ({
        kind: "existing" as const,
        ...p,
      }));
      const sameContact = fileDonors.filter(
        (d) =>
          (!idKey || !d.idKey) &&
          ((row.email && d.email === row.email) ||
            (row.phone && d.phone === row.phone))
      );
      for (const d of sameContact) {
        options.push({
          kind: "row",
          reason: row.email && d.email === row.email ? "email" : "phone",
          rowId: d.rowId,
          rowNumber: d.rowNumber,
        });
      }
      if (options.length === 0) {
        donor = { key: idKey ? `id:${idKey}` : `row:${input.id}`, kind: "new" };
      }
    }
    fileDonors.push({
      email: row.email,
      idKey,
      phone: row.phone,
      rowId: input.id,
      rowNumber: input.rowNumber,
    });

    const candidateParties = firstWithId
      ? firstWithId.candidatePartyIds
      : [
          ...(donor.kind === "existing" ? [donor.partyId] : []),
          ...options.flatMap((o) => (o.kind === "existing" ? [o.partyId] : [])),
        ];
    if (idKey && !firstWithId) {
      firstById.set(idKey, {
        candidatePartyIds: candidateParties,
        donor,
        rowId: input.id,
        rowNumber: input.rowNumber,
      });
    }
    const duplicate = findDuplicate(
      row,
      candidateParties,
      context.existingContributions
    );
    let category: ReviewCategory = "ready";
    if (options.length > 0 || duplicate || sameDonorAs) {
      category = "needs_review";
    } else if (donor.kind === "new") {
      category = "new_donor";
    }
    return {
      ...base,
      category,
      donor,
      donorOptions: options,
      duplicate,
      sameDonorAs,
    };
  });
}

// ── Decisions ───────────────────────────────────────────────────────────────

/** "new", "party:<id>" or "row:<rowId>". */
export type DonorChoice = string;

export interface RowDecision {
  /** Only for rows with donor options. */
  donor?: DonorChoice;
  /** "skip" leaves any row out; "import" confirms a possible duplicate. */
  contribution?: "import" | "skip";
}

export type RowPlan =
  | { action: "error" }
  | { action: "conflict" }
  | { action: "done" }
  | {
      action: "link";
      to: { contributionId: string } | { rowId: string };
    }
  | { action: "skip"; reason: "skipped_by_user" | "undecided" }
  | {
      action: "import";
      donor:
        | { kind: "existing"; partyId: string }
        | { kind: "new"; key: string };
    };

export const donorChoiceValue = (option: DonorOption): DonorChoice =>
  option.kind === "existing"
    ? `party:${option.partyId}`
    : `row:${option.rowId}`;

type ResolvedDonor =
  | { kind: "existing"; partyId: string }
  | { kind: "new"; key: string };

/** Who a row's contribution belongs to after the reviewer's choice, or null while undecided. */
function resolveDonor(
  row: ClassifiedRow,
  decision: RowDecision,
  resolved: ReadonlyMap<string, ResolvedDonor>
): ResolvedDonor | null {
  if (row.donor.kind === "existing") {
    return { kind: "existing", partyId: row.donor.partyId };
  }
  if (row.donor.kind === "new") {
    return { key: row.donor.key, kind: "new" };
  }
  if (row.sameDonorAs) {
    return resolved.get(row.sameDonorAs.rowId) ?? null;
  }
  if (decision.donor === "new") {
    return { key: `row:${row.rowId}`, kind: "new" };
  }
  const option = row.donorOptions.find(
    (o) => donorChoiceValue(o) === decision.donor
  );
  if (!option) {
    return null;
  }
  if (option.kind === "existing") {
    return { kind: "existing", partyId: option.partyId };
  }
  return (
    resolved.get(option.rowId) ?? { key: `row:${option.rowId}`, kind: "new" }
  );
}

/**
 * Applies the reviewer's choices to classified rows. Rows that still need a
 * choice and did not get one are skipped, never guessed. A row that joins an
 * earlier row's donor, by choice or by the same ID number, gets that row's
 * resolution (even when that row itself is skipped), so one donor is created.
 */
export function planRows(
  classified: readonly ClassifiedRow[],
  decisions: Readonly<Record<string, RowDecision>>
): Map<string, RowPlan> {
  const plans = new Map<string, RowPlan>();
  const resolvedDonor = new Map<string, ResolvedDonor>();

  for (const row of classified) {
    const decision = decisions[row.rowId] ?? {};
    const plan = ((): RowPlan => {
      switch (row.category) {
        case "done":
          return { action: "done" };
        case "error":
          return { action: "error" };
        case "conflict":
          return { action: "conflict" };
        case "already_imported":
        case "repeated_in_file":
          return row.linkTo
            ? { action: "link", to: row.linkTo }
            : { action: "conflict" };
        default:
          break;
      }
      const donor = resolveDonor(row, decision, resolvedDonor);
      if (donor) {
        resolvedDonor.set(row.rowId, donor);
      }
      if (decision.contribution === "skip") {
        return { action: "skip", reason: "skipped_by_user" };
      }
      if (row.duplicate && decision.contribution !== "import") {
        return { action: "skip", reason: "undecided" };
      }
      return donor
        ? { action: "import", donor }
        : { action: "skip", reason: "undecided" };
    })();
    plans.set(row.rowId, plan);
  }
  return plans;
}

export interface PlanSummary {
  conflicts: number;
  errors: number;
  imports: number;
  links: number;
  newDonors: number;
  skips: number;
}

export function summarizePlans(plans: Iterable<RowPlan>): PlanSummary {
  const summary: PlanSummary = {
    conflicts: 0,
    errors: 0,
    imports: 0,
    links: 0,
    newDonors: 0,
    skips: 0,
  };
  const newKeys = new Set<string>();
  for (const plan of plans) {
    if (plan.action === "import") {
      summary.imports += 1;
      if (plan.donor.kind === "new") {
        newKeys.add(plan.donor.key);
      }
    } else if (plan.action === "link") {
      summary.links += 1;
    } else if (plan.action === "skip") {
      summary.skips += 1;
    } else if (plan.action === "conflict") {
      summary.conflicts += 1;
    } else if (plan.action === "error") {
      summary.errors += 1;
    }
  }
  summary.newDonors = newKeys.size;
  return summary;
}
