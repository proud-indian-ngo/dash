import {
  type GiftOutcome,
  RETURN_BLOCK_LABELS,
  RETURN_EXCLUSION_LABELS,
  type ReturnBlock,
} from "@pi-dash/shared/donations-return";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";

import type { ReadinessGift } from "@/functions/donations-return";

/**
 * The readiness page's checklist, built from the server's per-gift outcomes
 * and the gifts synced to the page. Pure, so the rules for which gift shows
 * in which section are tested on their own.
 */

export type ChecklistSectionId =
  | "intermediary"
  | "missing_id"
  | "missing_details"
  | "invalid_id"
  | "filed"
  | "waiting"
  | "excluded"
  | "partly_refunded"
  | "csr";

/** Blocking sections stop gifts reaching the upload file; the rest are for information. */
export type ChecklistKind = "blocking" | "info";

/** What the row's action opens: the donor to fix their details, or the gift. */
export type ChecklistTarget = "donor" | "gift";

export interface ChecklistRow {
  giftId: string;
  netPaise: number;
  /** Why the gift is listed, when the section holds several reasons. */
  note: string | null;
  partyId: string;
  refundedPaise: number;
}

export interface ChecklistSection {
  description: string;
  /** Rows show the amount less refunds rather than the gift's amount. */
  showNet?: boolean;
  id: ChecklistSectionId;
  kind: ChecklistKind;
  rows: ChecklistRow[];
  target: ChecklistTarget;
  title: string;
}

const hasBlock = (outcome: GiftOutcome, block: ReturnBlock) =>
  outcome.kind === "blocked" && outcome.blocks.includes(block);

const inReturn = (outcome: GiftOutcome) =>
  outcome.kind === "ready" ||
  outcome.kind === "blocked" ||
  outcome.kind === "filed";

function toRow(gift: ReadinessGift, note: string | null = null): ChecklistRow {
  return {
    giftId: gift.id,
    netPaise: gift.netPaise,
    note,
    partyId: gift.partyId,
    refundedPaise: gift.refundedPaise,
  };
}

/** Notes for gifts a donor's missing name or address affects. */
function detailsNote(gift: ReadinessGift): string {
  const missing = (["missing_name", "missing_address"] as const).filter(
    (block) => hasBlock(gift.outcome, block)
  );
  if (missing.length > 0) {
    return missing.map((block) => RETURN_BLOCK_LABELS[block]).join(", ");
  }
  // An excluded gift carries no blocks; the donor still lacks name or address.
  return gift.outcome.kind === "excluded"
    ? `Name or address with PIN code missing · ${RETURN_EXCLUSION_LABELS[gift.outcome.reason]}`
    : "Name or address with PIN code missing";
}

export function buildChecklist(
  gifts: readonly ReadinessGift[],
  eligibilityReasons: ReadonlyMap<string, string | null>
): ChecklistSection[] {
  const excludedNote = (gift: ReadinessGift): string | null => {
    if (gift.outcome.kind !== "excluded") {
      return null;
    }
    const label = RETURN_EXCLUSION_LABELS[gift.outcome.reason];
    const reason = eligibilityReasons.get(gift.id);
    return gift.outcome.reason === "gift_excluded" && reason
      ? `${label}: ${reason}`
      : label;
  };
  return [
    {
      description:
        "Gifts recorded against a donation platform such as GiveIndia. Record the person who gave instead; the platform is only the intermediary.",
      id: "intermediary",
      kind: "blocking",
      rows: gifts
        .filter((gift) => hasBlock(gift.outcome, "intermediary_as_donor"))
        .map((gift) => toRow(gift)),
      target: "gift",
      title: "Donation platform recorded as the donor",
    },
    {
      description:
        "A PAN, or a passport, voter ID, driving licence or ration card number. These gifts can't go in the return until it is added.",
      id: "missing_id",
      kind: "blocking",
      rows: gifts
        .filter((gift) => hasBlock(gift.outcome, "missing_id"))
        .map((gift) => toRow(gift)),
      target: "donor",
      title: "Donors without an ID number",
    },
    {
      description:
        "A gift without the donor's name and an address with PIN code counts as anonymous for tax (section 115BBC), so this matters even for donors who don't want a certificate.",
      id: "missing_details",
      kind: "blocking",
      rows: gifts
        .filter((gift) => gift.missingDonorDetails)
        .map((gift) => toRow(gift, detailsNote(gift))),
      target: "donor",
      title: "Donors without a name or an address with PIN code",
    },
    {
      description:
        "The stored number doesn't match its type's format (a PAN is five letters, four digits and a letter) or can't be read. Check it against the donor's document.",
      id: "invalid_id",
      kind: "blocking",
      rows: gifts
        .filter((gift) => hasBlock(gift.outcome, "invalid_id"))
        .map((gift) => toRow(gift)),
      target: "donor",
      title: "ID numbers that don't look valid",
    },
    {
      description:
        "Gifts in a recorded filing. Their rows are frozen, so a later change to the gift or donor doesn't reach the portal; correcting a filed row needs a revision on the portal.",
      id: "filed",
      kind: "info",
      rows: gifts.flatMap((gift) =>
        gift.outcome.kind === "filed"
          ? [toRow(gift, `Filing ${gift.outcome.filingSequence}`)]
          : []
      ),
      target: "gift",
      title: "Filed",
    },
    {
      description:
        "Pending gifts and import rows waiting to sync or for a decision are not in the return until they are received and imported.",
      id: "waiting",
      kind: "info",
      rows: gifts
        .filter((gift) => gift.outcome.kind === "waiting")
        .map((gift) => toRow(gift, "Not received yet")),
      target: "gift",
      title: "Gifts still waiting",
    },
    {
      description:
        "Left out of the return: donors who don't want a certificate, gifts you excluded, cash above ₹2,000, in-kind and fully refunded gifts, and foreign currency (FCRA is not activated, so there should be none). The ₹2,000 cash limit and the in-kind rule are to be confirmed with the CA under the 2025 Act.",
      id: "excluded",
      kind: "info",
      rows: gifts
        .filter((gift) => gift.outcome.kind === "excluded")
        .map((gift) => toRow(gift, excludedNote(gift))),
      target: "gift",
      title: "Excluded",
    },
    {
      description:
        "Reported at the amount received less refunds. CA to confirm.",
      id: "partly_refunded",
      kind: "info",
      rows: gifts
        .filter((gift) => inReturn(gift.outcome) && gift.refundedPaise > 0)
        .map((gift) => toRow(gift, "Net of refunds")),
      showNet: true,
      target: "gift",
      title: "Partly refunded gifts",
    },
    csrSection(gifts),
  ];
}

/** CSR gifts in the return, for the CA to decide on. */
function csrSection(gifts: readonly ReadinessGift[]): ChecklistSection {
  const rows = gifts
    .filter((gift) => inReturn(gift.outcome) && gift.donationType === "csr")
    .map((gift) => toRow(gift, "CSR"));
  const total = sumPaise(rows.map((row) => row.netPaise));
  return {
    description: `${rows.length} included (${formatPaise(total)}). A company's CSR spending usually can't be claimed under 80G; ask your CA whether to include them.`,
    id: "csr",
    kind: "info",
    rows,
    target: "gift",
    title: "CSR gifts",
  };
}

/** Distinct donors among a section's rows. */
export function donorCount(rows: readonly ChecklistRow[]): number {
  return new Set(rows.map((row) => row.partyId)).size;
}
