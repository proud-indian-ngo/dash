import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import type { SocialPost } from "../schema";
import { zql } from "../schema";

/** Statuses a post can still be dropped from; `dropped` is final. */
export const DROPPABLE_SOCIAL_POST_STATUSES: readonly string[] = [
  "queued",
  "approved",
];

export const socialPostMutators = {
  /**
   * Drop a queued or approved post so the pipeline never publishes it. The
   * pipeline treats `dropped` as final, and `POST /posted` never revives it.
   */
  drop: defineMutator(
    z.object({ id: z.string().min(1), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "social.manage");
      const post = (await tx.run(zql.socialPost.where("id", args.id).one())) as
        | SocialPost
        | undefined;
      if (!post) {
        throw new Error("Social post not found");
      }
      if (!DROPPABLE_SOCIAL_POST_STATUSES.includes(post.status)) {
        throw new Error("Only queued or approved posts can be dropped");
      }
      await tx.mutate.socialPost.update({
        droppedAt: args.now,
        droppedBy: ctx.userId,
        id: args.id,
        status: "dropped",
        updatedAt: args.now,
      });
    }
  ),
};
