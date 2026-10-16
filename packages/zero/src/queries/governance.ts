import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

type Ctx = Parameters<typeof can>[0] | null | undefined;

/** Managing implies seeing, so a role with only governance.manage can still work the register. */
export function canSeeGovernance(ctx: Ctx): boolean {
  return (
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "governance.view") || can(ctx, "governance.manage"))
  );
}

/** Registrations are on filings too, so finance sees them as well. */
function canSeeRegistrations(ctx: Ctx): boolean {
  return (
    canSeeGovernance(ctx) ||
    (ctx !== null && ctx !== undefined && can(ctx, "finance.view"))
  );
}

/**
 * The register: trustees with every term and office, past and present.
 * Small by nature (the deed caps the board at nine), so the page computes
 * "who was a trustee on date D" on the client from the full history.
 */
export const trusteeQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.trustee
          .related("terms", (q) => q.orderBy("startsOn", "asc"))
          .related("offices", (q) => q.orderBy("startsOn", "asc"))
          .orderBy("legalName", "asc")
      : zql.trustee
          .where("id", "__never_match__")
          .related("terms")
          .related("offices")
  ),
};

export const deedVersionQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.deedVersion.related("document").orderBy("number", "asc")
      : zql.deedVersion.where("id", "__never_match__").related("document")
  ),
};

export const governanceDocumentQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.governanceDocument
          .orderBy("datedOn", "desc")
          .orderBy("createdAt", "desc")
      : zql.governanceDocument.where("id", "__never_match__")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    canSeeGovernance(ctx)
      ? zql.governanceDocument.where("id", id).one()
      : zql.governanceDocument.where("id", "__never_match__").one()
  ),
};

export const organisationRegistrationQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeRegistrations(ctx)
      ? zql.organisationRegistration
          .related("certificate")
          .orderBy("type", "asc")
          .orderBy("validFrom", "desc")
      : zql.organisationRegistration
          .where("id", "__never_match__")
          .related("certificate")
  ),
};
