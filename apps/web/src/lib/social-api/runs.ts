import { insertSocialRun } from "@pi-dash/db/queries/social-api";
import {
  SOCIAL_RUN_MAX_MESSAGE_LENGTH,
  SOCIAL_RUN_MAX_MESSAGES,
  socialRunTickValues,
} from "@pi-dash/shared/social-api";
import * as z from "zod";

import {
  defaultSocialAuthorize,
  readJsonBody,
  type SocialAuthorize,
  socialNoContent,
  socialServerError,
} from "./shared";

const MAX_COUNT = 1_000_000;
const count = z.number().int().min(0).max(MAX_COUNT);

// Hard bounds before the caps, so a huge list is refused, not walked.
const MAX_INPUT_MESSAGES = 1000;
const MAX_INPUT_MESSAGE_LENGTH = 10_000;

/** Keep the first 50 messages, each cut to 500 characters. */
const cappedMessages = z
  .array(z.string().max(MAX_INPUT_MESSAGE_LENGTH))
  .max(MAX_INPUT_MESSAGES)
  .transform((messages) =>
    messages
      .slice(0, SOCIAL_RUN_MAX_MESSAGES)
      .map((message) => message.slice(0, SOCIAL_RUN_MAX_MESSAGE_LENGTH))
  );

export const socialRunSchema = z
  .strictObject({
    digestSent: z.boolean(),
    dropped: count,
    errors: cappedMessages,
    eventsSeen: count,
    finishedAt: z.iso.datetime({ offset: true }),
    planned: count,
    recorded: count,
    rendered: count,
    skipped: cappedMessages,
    startedAt: z.iso.datetime({ offset: true }),
    tick: z.enum(socialRunTickValues),
  })
  .refine((run) => Date.parse(run.finishedAt) >= Date.parse(run.startedAt), {
    message: "finishedAt must not be before startedAt",
    path: ["finishedAt"],
  });

export interface SocialRunsDeps {
  authorize: SocialAuthorize;
  insertSocialRun: typeof insertSocialRun;
  now: () => Date;
}

const defaultDeps: SocialRunsDeps = {
  authorize: defaultSocialAuthorize,
  insertSocialRun,
  now: () => new Date(),
};

/**
 * `POST /api/social/v1/runs` (scope social:write): store one pipeline run
 * report for the Social page. Only the latest 500 reports are kept.
 */
export async function handleSocialRunsWrite(
  request: Request,
  deps: SocialRunsDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "social:write", "runs");
  if (auth.error) {
    return auth.error;
  }
  const read = await readJsonBody(request);
  if ("tooLarge" in read) {
    return read.tooLarge;
  }
  const parsed = socialRunSchema.safeParse(read.body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid run report",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
  const run = parsed.data;
  try {
    await deps.insertSocialRun(
      {
        ...run,
        finishedAt: new Date(run.finishedAt),
        startedAt: new Date(run.startedAt),
      },
      deps.now()
    );
    return socialNoContent();
  } catch (error) {
    return socialServerError(request, error, { tokenId: auth.token.id });
  }
}
