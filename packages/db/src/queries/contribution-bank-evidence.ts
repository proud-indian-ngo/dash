import { and, eq, inArray } from "drizzle-orm";

import { db } from "..";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import { statementLine } from "../schema/statement-line";

const QUERY_CHUNK_SIZE = 1000;

export interface ContributionBankEvidenceResult {
  matchedContributionIds: string[];
  processedContributionIds: string[];
}

/**
 * Returns bank evidence only for the requested Income-table contributions.
 * The input is bounded by the server function and chunked here to keep each
 * `IN` predicate comfortably below PostgreSQL's parameter limit.
 */
export async function contributionBankEvidence(
  contributionIds: readonly string[],
  reader: Pick<typeof db, "select"> = db
): Promise<ContributionBankEvidenceResult> {
  const ids = [...new Set(contributionIds)];
  const matchedContributionIds = new Set<string>();
  const processedContributionIds = new Set<string>();

  for (let offset = 0; offset < ids.length; offset += QUERY_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + QUERY_CHUNK_SIZE);
    const [matched, processed] = await Promise.all([
      reader
        .select({ contributionId: statementLine.matchedContributionId })
        .from(statementLine)
        .where(
          and(
            eq(statementLine.matchStatus, "matched"),
            inArray(statementLine.matchedContributionId, chunk)
          )
        ),
      reader
        .select({ contributionId: gatewaySettlementItem.contributionId })
        .from(gatewaySettlementItem)
        .innerJoin(
          gatewaySettlement,
          eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
        )
        .where(
          and(
            eq(gatewaySettlementItem.type, "payment"),
            eq(gatewaySettlement.status, "processed"),
            inArray(gatewaySettlementItem.contributionId, chunk)
          )
        ),
    ]);

    for (const row of matched) {
      if (row.contributionId) {
        matchedContributionIds.add(row.contributionId);
      }
    }
    for (const row of processed) {
      if (row.contributionId) {
        processedContributionIds.add(row.contributionId);
      }
    }
  }

  return {
    matchedContributionIds: [...matchedContributionIds],
    processedContributionIds: [...processedContributionIds],
  };
}
