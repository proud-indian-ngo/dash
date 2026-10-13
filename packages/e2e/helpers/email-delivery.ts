import { db } from "@pi-dash/db";
import {
  clearEmailSuppression,
  recordEmailSuppression,
} from "@pi-dash/db/queries/email-suppression";
import { user } from "@pi-dash/db/schema/auth";
import {
  isTopicEmailEnabled,
  setTopicEmailEnabled,
  unsubscribeQuery,
} from "@pi-dash/notifications/unsubscribe";
import { eq } from "drizzle-orm";

/**
 * Fixtures for the email delivery specs: signed unsubscribe links (the app
 * signs them at send time, so specs can't build one in the browser) and
 * suppression rows (normally written by Resend's webhook).
 */
async function userIdFor(email: string): Promise<string> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row) {
    throw new Error(`No user ${email}`);
  }
  return row.id;
}

async function unsubscribeLink(email: string, topic: string) {
  const userId = await userIdFor(email);
  // Start subscribed, whatever an earlier run left behind.
  await setTopicEmailEnabled(userId, topic, true);
  return { path: `/unsubscribe?${unsubscribeQuery(userId, topic)}` };
}

const [action, email = "", topic = ""] = process.argv.slice(2);
let result: unknown;
if (action === "link") {
  result = await unsubscribeLink(email, topic);
} else if (action === "email-enabled") {
  result = {
    emailEnabled: await isTopicEmailEnabled(await userIdFor(email), topic),
  };
} else if (action === "suppress") {
  await recordEmailSuppression({ email, reason: "hard_bounce" });
  result = { suppressed: true };
} else if (action === "clear") {
  result = { cleared: await clearEmailSuppression(email) };
} else {
  throw new Error(`Unsupported email delivery fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
