import type {
  Contribution,
  ContributionReceipt,
  ContributionRefund,
  Fund,
  ImportBatch,
  OrgAccount,
  OtherIncome,
  Party,
  PartyRole,
  Programme,
  Project,
} from "@pi-dash/zero/schema";

/** A contribution as the Income page query returns it. */
export type ContributionRow = Contribution & {
  fund?: Fund | null;
  importBatch?: ImportBatch | null;
  /** The platform that passed the gift on, such as GiveIndia for give.do. */
  intermediary?: Party | null;
  orgAccount?: OrgAccount | null;
  /** With its active intermediary role only, if it holds one. */
  party?: (Party & { roles?: readonly PartyRole[] }) | null;
  programme?: Programme | null;
  project?: Project | null;
  /** Receipts pi-dash issued for it, newest first, voided ones included. */
  receipts?: readonly ContributionReceipt[];
  /** Refunds recorded against it, oldest first; written only by the server. */
  refunds?: readonly ContributionRefund[];
};

export type OtherIncomeRow = OtherIncome & {
  fund?: Fund | null;
  orgAccount?: OrgAccount | null;
};

export function donorName(row: ContributionRow): string {
  return row.party?.displayName ?? "Unknown donor";
}

/** "Programme · Project", or whichever is set. */
export function programmeLabel(row: ContributionRow): string | null {
  const parts = [row.programme?.name, row.project?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "file.csv · 12 Oct 2026", to tell batches apart in filters. */
export function importBatchLabel(batch: {
  createdAt: number;
  fileName: string;
}): string {
  const date = new Date(batch.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${batch.fileName} · ${date}`;
}
