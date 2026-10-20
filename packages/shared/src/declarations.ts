/**
 * Conflict-of-interest declarations and the policy register.
 * Pure, so the forms, the server and the finance warning agree.
 */

/** One interest a trustee declares: a person or organisation they're connected to. */
export interface DeclaredInterest {
  /** What the connection involves, e.g. "supplies printing". */
  nature: string;
  /** The person's or organisation's name, as it would appear on a payment. */
  party: string;
  /** "Spouse", "Director", "Partner"... */
  relationship: string;
}

export const DECLARATION_INTERESTS_MAX = 20;
export const DECLARATION_FIELD_MAX = 200;

/**
 * A declaration waits for the trustee's DSC signature and counts once
 * signed. "confirmed" is one made by a click before signatures were
 * required; it still counts.
 */
export const declarationStatusValues = [
  "awaiting_signature",
  "signed",
  "confirmed",
] as const;
export type DeclarationStatus = (typeof declarationStatusValues)[number];

export const DECLARATION_STATUS_LABELS: Record<DeclarationStatus, string> = {
  awaiting_signature: "Waiting for signature",
  confirmed: "Confirmed without a signature",
  signed: "Signed",
};

interface DeclarationLike {
  declaredAt: Date | number;
  id: string;
  status: DeclarationStatus;
  trusteeId: string;
}

/**
 * Per trustee, from one year's declarations: the one in force (the last
 * signed, or confirmed) and the one waiting for their signature, if any.
 */
export function declarationsByTrustee<T extends DeclarationLike>(
  rows: readonly T[]
): Map<string, { awaiting: T | null; inForce: T | null }> {
  const byTrustee = new Map<
    string,
    { awaiting: T | null; inForce: T | null }
  >();
  for (const row of rows) {
    const entry = byTrustee.get(row.trusteeId) ?? {
      awaiting: null,
      inForce: null,
    };
    if (row.status === "awaiting_signature") {
      entry.awaiting = row;
    } else if (!entry.inForce || later(row, entry.inForce)) {
      entry.inForce = row;
    }
    byTrustee.set(row.trusteeId, entry);
  }
  return byTrustee;
}

function later(a: DeclarationLike, b: DeclarationLike): boolean {
  const at = Number(a.declaredAt);
  const bt = Number(b.declaredAt);
  return at === bt ? a.id > b.id : at > bt;
}

const HONORIFICS =
  /^(m\/s\.?|messrs\.?|mr\.?|mrs\.?|ms\.?|dr\.?|shri\.?|smt\.?|sri\.?)\s+/;
const COMPANY_SUFFIXES =
  /\s+(private limited|pvt\.? ltd\.?|limited|ltd\.?|llp|& co\.?|and co\.?|co\.?)$/;

/** A name reduced for matching: case, honorifics, company suffixes and punctuation ignored. */
export function normaliseName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, " ");
  n = n.replace(HONORIFICS, "");
  n = n.replace(COMPANY_SUFFIXES, "");
  return n
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type PaymentWarningKind = "trustee" | "related_party";

export interface PaymentWarning {
  kind: PaymentWarningKind;
  /** Plain text for the approver; names only the payee and the trustee. */
  message: string;
  trusteeName: string;
}

/**
 * Warnings for a payment to a payee (clause 7.24 and the declarations): the
 * payee is a trustee in office, or someone a trustee declared an interest in
 * for the payment's financial year. Matching is by normalised name, so it
 * warns rather than blocks.
 */
export function paymentWarnings(input: {
  declarations: readonly {
    interests: readonly DeclaredInterest[];
    trusteeName: string;
  }[];
  payeeName: string;
  trustees: readonly { legalName: string }[];
}): PaymentWarning[] {
  const payee = normaliseName(input.payeeName);
  if (!payee) {
    return [];
  }
  const warnings: PaymentWarning[] = [];
  for (const t of input.trustees) {
    if (normaliseName(t.legalName) === payee) {
      warnings.push({
        kind: "trustee",
        message: `${t.legalName} is a trustee. The deed (clause 7.24) allows trustees their expenses only: pay them through a reimbursement, not as a vendor.`,
        trusteeName: t.legalName,
      });
    }
  }
  for (const d of input.declarations) {
    const match = d.interests.find((i) => normaliseName(i.party) === payee);
    if (match) {
      warnings.push({
        kind: "related_party",
        message: `${d.trusteeName} declared an interest in ${match.party} (${match.relationship}). They should take no part in approving this payment.`,
        trusteeName: d.trusteeName,
      });
    }
  }
  return warnings;
}

// ── Policies ────────────────────────────────────────────────────────────────

export const policyAudienceValues = ["everyone", "trustees"] as const;
export type PolicyAudience = (typeof policyAudienceValues)[number];

export const POLICY_AUDIENCE_LABELS: Record<PolicyAudience, string> = {
  everyone: "Everyone with an account",
  trustees: "Trustees",
};

/** The child-safeguarding policy, ensured on every start. */
export const SAFEGUARDING_POLICY_KEY = "child_safeguarding";

/** The refusal shown when someone hasn't acknowledged the safeguarding policy. */
export const SAFEGUARDING_GATE_MESSAGE =
  "Accept the child-safeguarding policy before you join events with children. Reload the dashboard to see it.";

/** The version in force on a date: the latest that took effect on or before it. */
export function policyVersionOn<
  T extends { effectiveOn: string; version: number },
>(versions: readonly T[], on: string): T | null {
  let found: T | null = null;
  for (const v of versions) {
    if (v.effectiveOn <= on && (found === null || v.version > found.version)) {
      found = v;
    }
  }
  return found;
}

/**
 * The versions in force on a date that a person hasn't acknowledged, from
 * the policies meant for them: everyone's, and trustees' while they are in
 * office. `updated` when they acknowledged an earlier version. The dashboard
 * asks them to accept these before they use it.
 */
export function outstandingPolicyVersions<
  V extends { effectiveOn: string; id: string; version: number },
  P extends { audience: PolicyAudience; versions: readonly V[] },
>(input: {
  acknowledged: ReadonlySet<string>;
  inOffice: boolean;
  on: string;
  policies: readonly P[];
}): { policy: P; updated: boolean; version: V }[] {
  return input.policies.flatMap((policy) => {
    if (policy.audience === "trustees" && !input.inOffice) {
      return [];
    }
    const version = policyVersionOn(policy.versions, input.on);
    if (!version || input.acknowledged.has(version.id)) {
      return [];
    }
    const updated = policy.versions.some(
      (v) => v.version < version.version && input.acknowledged.has(v.id)
    );
    return [{ policy, updated, version }];
  });
}

export const POLICY_TITLE_MAX = 200;
export const POLICY_SUMMARY_MAX = 2000;
