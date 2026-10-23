import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const canSeeGrants = (ctx: Parameters<typeof can>[0] | null | undefined) =>
  ctx !== null && ctx !== undefined && can(ctx, "finance.view");

/** Grants are finance data: finance.view only. A handful of rows, so every grant syncs. */
export const grantQueries = {
  all: defineQuery(({ ctx }) =>
    (canSeeGrants(ctx)
      ? zql.grantAgreement
      : zql.grantAgreement.where("id", "__never_match__")
    )
      .related("party")
      .related("programme")
      .related("project")
      .related("tranches")
      .orderBy("startsOn", "desc")
      .orderBy("id", "asc")
  ),
  /** The grant page: its tranches, budget and the contributions linked to it. */
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    (canSeeGrants(ctx)
      ? zql.grantAgreement.where("id", id)
      : zql.grantAgreement.where("id", "__never_match__")
    )
      .related("party")
      .related("programme")
      .related("project")
      .related("tranches", (t) => t.orderBy("expectedOn", "asc"))
      .related("budgetLines")
      .related("contributions", (c) =>
        c.related("refunds").orderBy("receivedOn", "asc").orderBy("id", "asc")
      )
      .one()
  ),
};

/**
 * Utilisation certificates. Finance readers see every one; the two trustees
 * who sign one see that one, without finance permissions, so they can read
 * what they sign. The snapshot holds everything they need, so no grant row
 * reaches them.
 */
export const utilisationCertificateQueries = {
  /** A grant's certificates, newest first. */
  byGrant: defineQuery(
    z.object({ grantId: z.string() }),
    ({ args: { grantId }, ctx }) =>
      (canSeeGrants(ctx)
        ? zql.utilisationCertificate.where("grantId", grantId)
        : zql.utilisationCertificate.where("id", "__never_match__")
      )
        .orderBy("createdAt", "desc")
        .orderBy("id", "asc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    const certificate = zql.utilisationCertificate
      .where("id", id)
      .related("headTrustee")
      .related("financeTrustee");
    if (canSeeGrants(ctx)) {
      return certificate.one();
    }
    if (!ctx) {
      return zql.utilisationCertificate
        .where("id", "__never_match__")
        .related("headTrustee")
        .related("financeTrustee")
        .one();
    }
    return certificate
      .where(({ exists, or }) =>
        or(
          exists("headTrustee", (t) => t.where("userId", ctx.userId)),
          exists("financeTrustee", (t) => t.where("userId", ctx.userId))
        )
      )
      .one();
  }),
  /** The certificates waiting for the signed-in trustee's signature: the dashboard card. */
  toSign: defineQuery(({ ctx }) =>
    ctx
      ? zql.utilisationCertificate
          .where(({ and, cmp, exists, or }) =>
            or(
              and(
                cmp("status", "awaiting_head"),
                exists("headTrustee", (t) => t.where("userId", ctx.userId))
              ),
              and(
                cmp("status", "awaiting_finance"),
                exists("financeTrustee", (t) => t.where("userId", ctx.userId))
              )
            )
          )
          .orderBy("createdAt", "asc")
      : zql.utilisationCertificate.where("id", "__never_match__")
  ),
};
