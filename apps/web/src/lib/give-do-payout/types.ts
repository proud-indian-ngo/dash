import type {
  ReviewResponse,
  RunResponse,
} from "@/lib/income-import/review-types";

export interface PayoutReview {
  amountPaise: number;
  existing: { changed: boolean; id: string } | null;
  feesPaise: number;
  grossPaise: number;
  review: ReviewResponse;
  settledOn: string;
  utr: string;
}

export interface PayoutRunResult {
  alreadyImported: boolean;
  changed: boolean;
  result: RunResponse | null;
  settlementId: string;
}
