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
  /** The trustees linked to the signed-in account, for their own declaration. */
  me: defineQuery(({ ctx }) =>
    zql.trustee
      .where("userId", ctx?.userId ?? "__never_match__")
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

const resolutionDetail = () =>
  zql.resolution
    .related("responses", (q) => q.related("trustee").related("signature"))
    .related("circular", (q) =>
      q
        .related("issuedBy")
        .related("resolutions", (r) =>
          r.orderBy("position", "asc").related("responses")
        )
    );

/**
 * Resolutions: everything for governance; for a trustee, the ones issued
 * while they were in office (they have a response row under their account).
 */
export const resolutionQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.resolution
          .related("responses")
          .related("circular")
          .orderBy("updatedAt", "desc")
      : zql.resolution
          .where("id", "__never_match__")
          .related("responses")
          .related("circular")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    if (canSeeGovernance(ctx)) {
      return resolutionDetail().where("id", id).one();
    }
    if (ctx) {
      return resolutionDetail()
        .where("id", id)
        .whereExists("responses", (r) => r.where("userId", ctx.userId))
        .one();
    }
    return resolutionDetail().where("id", "__never_match__").one();
  }),
  /** Circular drafts waiting to be issued, oldest first: what an issue can carry. */
  drafts: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.resolution
          .where("status", "draft")
          .where("kind", "circular")
          .orderBy("createdAt", "asc")
      : zql.resolution.where("id", "__never_match__")
  ),
  /** Resolutions sent to the signed-in trustee. */
  mine: defineQuery(({ ctx }) =>
    ctx
      ? zql.resolution
          .where("status", "!=", "draft")
          .whereExists("responses", (r) => r.where("userId", ctx.userId))
          .related("responses")
          .related("circular")
          .orderBy("updatedAt", "desc")
      : zql.resolution
          .where("id", "__never_match__")
          .related("responses")
          .related("circular")
  ),
  /** The signed-in trustee's answers still pending on open resolutions: the dashboard card. */
  awaitingMe: defineQuery(({ ctx }) =>
    ctx
      ? zql.resolutionResponse
          .where("userId", ctx.userId)
          .where("response", "pending")
          .where("conflictDeclared", false)
          .whereExists("resolution", (q) => q.where("status", "issued"))
          .related("resolution", (q) => q.related("circular"))
      : zql.resolutionResponse
          .where("id", "__never_match__")
          .related("resolution", (q) => q.related("circular"))
  ),
};

const circularDetail = () =>
  zql.circular
    .related("issuedBy")
    .related("revisions", (q) => q.orderBy("revision", "desc").limit(1))
    .related("signatures", (q) => q.related("trustee"))
    .related("resolutions", (q) =>
      q
        .orderBy("position", "asc")
        .related("responses", (r) => r.related("trustee").related("signature"))
    );

/**
 * Circulars: everything for governance; for a trustee, the ones sent to
 * them (they have a response on its resolutions under their account).
 */
export const circularQueries = {
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    if (canSeeGovernance(ctx)) {
      return circularDetail().where("id", id).one();
    }
    if (ctx) {
      return circularDetail()
        .where("id", id)
        .whereExists("resolutions", (q) =>
          q.whereExists("responses", (r) => r.where("userId", ctx.userId))
        )
        .one();
    }
    return circularDetail().where("id", "__never_match__").one();
  }),
};

export const complianceQueries = {
  items: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.complianceItem
          .related("evidence")
          .orderBy("dueOn", "asc")
          .orderBy("title", "asc")
      : zql.complianceItem.where("id", "__never_match__").related("evidence")
  ),
  templates: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.complianceTemplate.orderBy("title", "asc")
      : zql.complianceTemplate.where("id", "__never_match__")
  ),
};

const meetingDetail = () =>
  zql.meeting
    .related("agenda", (q) =>
      q.related("votes").related("resolution").orderBy("position", "asc")
    )
    .related("attendance", (q) => q.related("trustee"))
    .related("chair")
    .related("deedVersion")
    .related("minutesDocument");

/**
 * Board meetings: everything for governance; for a trustee, the meetings
 * whose notice went to them.
 */
export const meetingQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.meeting.related("agenda").orderBy("startsAt", "desc")
      : zql.meeting.where("id", "__never_match__").related("agenda")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    if (canSeeGovernance(ctx)) {
      return meetingDetail().where("id", id).one();
    }
    if (ctx) {
      return meetingDetail()
        .where("id", id)
        .whereExists("attendance", (a) =>
          a.whereExists("trustee", (t) => t.where("userId", ctx.userId))
        )
        .one();
    }
    return meetingDetail().where("id", "__never_match__").one();
  }),
  /** Meetings the signed-in trustee was given notice of. */
  mine: defineQuery(({ ctx }) =>
    ctx
      ? zql.meeting
          .where("status", "!=", "draft")
          .whereExists("attendance", (a) =>
            a.whereExists("trustee", (t) => t.where("userId", ctx.userId))
          )
          .related("agenda")
          .orderBy("startsAt", "desc")
      : zql.meeting.where("id", "__never_match__").related("agenda")
  ),
};

/** Declarations of interests: all for governance; a trustee's own otherwise. */
export const conflictDeclarationQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.conflictDeclaration
          .related("document")
          .orderBy("declaredAt", "desc")
      : zql.conflictDeclaration
          .where("id", "__never_match__")
          .related("document")
  ),
  mine: defineQuery(({ ctx }) =>
    zql.conflictDeclaration
      .whereExists("trustee", (t) =>
        t.where("userId", ctx?.userId ?? "__never_match__")
      )
      .orderBy("declaredAt", "desc")
  ),
};

/**
 * Policies and their versions are readable by everyone signed in, who
 * acknowledges them; acknowledgements are a person's own, or everyone's
 * for governance.
 */
export const policyQueries = {
  all: defineQuery(({ ctx }) =>
    ctx
      ? zql.policy
          .related("versions", (q) => q.orderBy("version", "desc"))
          .orderBy("title", "asc")
      : zql.policy.where("id", "__never_match__").related("versions")
  ),
  acknowledgements: defineQuery(({ ctx }) =>
    canSeeGovernance(ctx)
      ? zql.policyAcknowledgement
      : zql.policyAcknowledgement.where("id", "__never_match__")
  ),
  myAcknowledgements: defineQuery(({ ctx }) =>
    zql.policyAcknowledgement.where("userId", ctx?.userId ?? "__never_match__")
  ),
};
