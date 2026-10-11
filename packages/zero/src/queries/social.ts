import { SOCIAL_RUN_RETENTION } from "@pi-dash/shared/social-api";
import { defineQuery } from "@rocicorp/zero";

import { can } from "../permissions";
import { zql } from "../schema";

/**
 * The pipeline's posted log, newest first, for the Social page. Dropper names
 * come from the `getSocialPeople` server function, so no user rows sync here.
 */
export const socialPostQueries = {
  all: defineQuery(({ ctx }) => {
    const query = zql.socialPost
      .orderBy("scheduledFor", "desc")
      .orderBy("id", "desc");
    return ctx && can(ctx, "social.manage")
      ? query
      : query.where("id", "__never_match__");
  }),
};

/** Pipeline run reports, newest first (read-only; written by the social API). */
export const socialRunQueries = {
  all: defineQuery(({ ctx }) => {
    const query = zql.socialRun
      .orderBy("startedAt", "desc")
      .orderBy("id", "desc")
      .limit(SOCIAL_RUN_RETENTION);
    return ctx && can(ctx, "social.manage")
      ? query
      : query.where("id", "__never_match__");
  }),
};
