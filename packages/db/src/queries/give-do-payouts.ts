import { and, eq, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { orgAccount } from "../schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import { contribution } from "../schema/income";
import { externalIdentity } from "../schema/private/imports";
import type { ImportTx } from "./income-import";

export interface GiveDoPayoutItem {
  creditPaise: number;
  externalId: string;
  feePaise: number;
}

export interface GiveDoPayoutAmounts {
  amountPaise: number;
  feesPaise: number;
  grossPaise: number;
  items: readonly GiveDoPayoutItem[];
  utr: string;
}

/** Only fixed messages from this module may cross the import error boundary. */
export class GiveDoPayoutInputError extends Error {}

export async function requireGiveDoClearingAccount(
  id: string,
  reader: Pick<typeof db, "select"> = db,
  lock = false
) {
  const query = reader
    .select({ active: orgAccount.active, kind: orgAccount.kind })
    .from(orgAccount)
    .where(eq(orgAccount.id, id));
  const [account] = lock ? await query.for("update") : await query;
  if (!(account?.active && account.kind === "gateway_clearing")) {
    throw new GiveDoPayoutInputError(
      "Choose an active give.do clearing account."
    );
  }
}

export async function findGiveDoPayout(
  utr: string,
  reader: Pick<typeof db, "select"> = db
) {
  const [settlement] = await reader
    .select()
    .from(gatewaySettlement)
    .where(
      and(
        eq(gatewaySettlement.provider, "give_do"),
        eq(gatewaySettlement.providerAccount, "live"),
        eq(gatewaySettlement.externalId, utr)
      )
    );
  if (!settlement) {
    return null;
  }
  const items = await reader
    .select()
    .from(gatewaySettlementItem)
    .where(eq(gatewaySettlementItem.settlementId, settlement.id));
  return { ...settlement, items, utr: settlement.externalId };
}

/** Same UTR never replaces evidence, including a redistribution with unchanged totals. */
export function giveDoPayoutChanged(
  existing: GiveDoPayoutAmounts,
  incoming: GiveDoPayoutAmounts
): boolean {
  if (
    existing.amountPaise !== incoming.amountPaise ||
    existing.feesPaise !== incoming.feesPaise ||
    existing.grossPaise !== incoming.grossPaise ||
    existing.items.length !== incoming.items.length
  ) {
    return true;
  }
  const byId = new Map(existing.items.map((item) => [item.externalId, item]));
  return incoming.items.some((item) => {
    const before = byId.get(item.externalId);
    return (
      !before ||
      before.creditPaise !== item.creditPaise ||
      before.feePaise !== item.feePaise
    );
  });
}

/** Check the contribution evidence under row locks before creating any payout links. */
export async function validateGiveDoPayoutLinks(
  tx: ImportTx,
  payout: GiveDoPayoutAmounts,
  orgAccountId: string
): Promise<void> {
  const identities = await tx
    .select({
      account: externalIdentity.providerAccount,
      contributionId: externalIdentity.contributionId,
      externalId: externalIdentity.externalId,
    })
    .from(externalIdentity)
    .where(
      and(
        eq(externalIdentity.provider, "give_do"),
        eq(externalIdentity.entityType, "payment"),
        inArray(
          externalIdentity.externalId,
          payout.items.map((item) => item.externalId)
        )
      )
    );
  if (identities.some((identity) => identity.account !== orgAccountId)) {
    throw new GiveDoPayoutInputError(
      "A donation in this payout was imported into another clearing account. Resolve its account before importing the payout."
    );
  }
  const [alreadyPaid] = await tx
    .select({ id: gatewaySettlementItem.id })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(
      and(
        eq(gatewaySettlement.provider, "give_do"),
        eq(gatewaySettlement.providerAccount, "live"),
        eq(gatewaySettlementItem.type, "payment"),
        inArray(
          gatewaySettlementItem.externalId,
          payout.items.map((item) => item.externalId)
        ),
        eq(gatewaySettlement.status, "processed")
      )
    )
    .limit(1);
  if (alreadyPaid) {
    throw new GiveDoPayoutInputError(
      "A donation in this payout already belongs to a processed settlement."
    );
  }
  if (identities.length === 0) {
    return;
  }
  const gifts = await tx
    .select()
    .from(contribution)
    .where(
      inArray(
        contribution.id,
        identities.map((identity) => identity.contributionId)
      )
    )
    .orderBy(contribution.id)
    .for("update");
  const giftsById = new Map(gifts.map((gift) => [gift.id, gift]));
  const itemById = new Map(payout.items.map((item) => [item.externalId, item]));
  for (const identity of identities) {
    const gift = giftsById.get(identity.contributionId);
    const item = itemById.get(identity.externalId);
    if (
      !(
        gift &&
        item &&
        gift.channel === "give_do" &&
        gift.orgAccountId === orgAccountId &&
        gift.amountPaise === item.creditPaise + item.feePaise
      )
    ) {
      throw new GiveDoPayoutInputError(
        "A recorded donation differs from this payout's amount, channel or account. Resolve it before importing the payout."
      );
    }
  }
}

/** Writes one processed payout after the caller imported any selected unknown gifts. */
export async function recordGiveDoPayoutIn(
  tx: ImportTx,
  input: GiveDoPayoutAmounts & { orgAccountId: string; settledOn: string },
  now: Date
): Promise<string> {
  const id = uuidv7();
  await tx.insert(gatewaySettlement).values({
    amountPaise: input.amountPaise,
    createdAt: now,
    externalId: input.utr,
    feesPaise: input.feesPaise,
    grossPaise: input.grossPaise,
    id,
    itemCount: input.items.length,
    orgAccountId: input.orgAccountId,
    paymentCount: input.items.length,
    provider: "give_do",
    providerAccount: "live",
    settledOn: input.settledOn,
    status: "processed",
    taxPaise: 0,
    updatedAt: now,
    utr: input.utr,
  });
  for (let offset = 0; offset < input.items.length; offset += 500) {
    await tx.insert(gatewaySettlementItem).values(
      input.items.slice(offset, offset + 500).map((item) => ({
        ...item,
        id: uuidv7(),
        settledAt: new Date(`${input.settledOn}T00:00:00+05:30`),
        settlementId: id,
        taxPaise: 0,
        type: "payment" as const,
      }))
    );
  }
  await linkGiveDoSettlementPaymentsIn(tx, input.orgAccountId);
  return id;
}

/** A later give.do contribution import also links payout rows left unlinked at review. */
export async function linkGiveDoSettlementPaymentsIn(
  tx: ImportTx,
  orgAccountId: string,
  paymentId?: string
): Promise<void> {
  const narrow = paymentId ? sql`and i.external_id = ${paymentId}` : sql``;
  // The payout's own row is touched too, so the books' incremental posting
  // sees that its lines changed.
  await tx.execute(sql`
    with linked as (
    update ${gatewaySettlementItem} i set contribution_id = c.id
    from ${gatewaySettlement} s, ${externalIdentity} ei, ${contribution} c
    where s.id = i.settlement_id and s.provider = 'give_do' and s.provider_account = 'live'
      and s.org_account_id = ${orgAccountId} and i.type = 'payment' and i.contribution_id is null
      and ei.provider = 'give_do' and ei.entity_type = 'payment' and ei.provider_account = ${orgAccountId}
      and ei.external_id = i.external_id and c.id = ei.contribution_id
      and c.channel = 'give_do' and c.org_account_id = s.org_account_id
      and c.amount_paise = i.credit_paise + i.fee_paise ${narrow}
    returning i.settlement_id)
    update ${gatewaySettlement} g set updated_at = now()
    where g.id in (select settlement_id from linked)`);
  await tx.execute(sql`
    update ${contribution} c set gateway_fee_paise = i.fee_paise, updated_at = now()
    from ${gatewaySettlementItem} i, ${gatewaySettlement} s
    where s.id = i.settlement_id and s.provider = 'give_do' and s.provider_account = 'live'
      and s.org_account_id = ${orgAccountId} and i.type = 'payment' and i.contribution_id = c.id
      and c.gateway_fee_paise = 0 ${narrow}`);
}
