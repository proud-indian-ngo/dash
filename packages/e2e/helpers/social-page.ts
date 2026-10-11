import { createHash, randomBytes } from "node:crypto";

import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { socialApiToken } from "@pi-dash/db/schema/social-api-token";
import { socialPost } from "@pi-dash/db/schema/social-post";
import { socialRun } from "@pi-dash/db/schema/social-run";
import { eq, inArray } from "drizzle-orm";

/**
 * Social page fixture: a queued post, a token with events:read and
 * social:write, and no social pause keys or posting rules. Runs the spec reports carry
 * `RUN_MARKER` events seen so cleanup removes only them.
 */
const ID = {
  post: "019f0000-0040-7000-8000-000000004001",
  token: "019f0000-0040-7000-8000-000000004002",
} as const;
const RUN_MARKER = 4321;
const PAUSE_KEYS = ["social_paused", "social_paused_kinds", "social_rules"];

async function cleanup() {
  await db.delete(socialApiToken).where(eq(socialApiToken.id, ID.token));
  await db.delete(socialPost).where(eq(socialPost.id, ID.post));
  await db.delete(socialRun).where(eq(socialRun.eventsSeen, RUN_MARKER));
  await db.delete(appConfig).where(inArray(appConfig.key, PAUSE_KEYS));
}

async function setup() {
  await cleanup();
  const now = new Date();
  await db.insert(socialPost).values({
    bufferPostId: "e2e-social-page-buffer",
    channel: "instagram",
    createdAt: now,
    eventId: "e2e-social-page-event",
    eventName: "Social page E2E session",
    held: true,
    id: ID.post,
    kind: "volunteer-call",
    occurrenceDate: now.toISOString().slice(0, 10),
    scheduledFor: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    status: "queued",
    updatedAt: now,
  });
  const token = randomBytes(32).toString("base64url");
  await db.insert(socialApiToken).values({
    createdAt: now,
    id: ID.token,
    name: "social page e2e",
    scopes: ["events:read", "social:write"],
    tokenHash: createHash("sha256").update(token).digest("hex"),
  });
  return { runMarker: RUN_MARKER, token };
}

async function inspect() {
  const post = await db.query.socialPost.findFirst({
    columns: { droppedAt: true, droppedBy: true, status: true },
    where: eq(socialPost.id, ID.post),
  });
  const dropper = post?.droppedBy
    ? await db.query.user.findFirst({
        columns: { name: true },
        where: eq(user.id, post.droppedBy),
      })
    : undefined;
  return {
    droppedAt: post?.droppedAt?.toISOString() ?? null,
    droppedBy: post?.droppedBy ?? null,
    droppedByName: dropper?.name ?? null,
    status: post?.status ?? null,
  };
}

const [action] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup") {
  result = await setup();
} else if (action === "inspect") {
  result = await inspect();
} else {
  throw new Error(`Unsupported social page fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
