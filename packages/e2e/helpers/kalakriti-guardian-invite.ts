import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { eq } from "drizzle-orm";

const EMAILS = [
  "kalakriti-invite-gate@pi-dash.test",
  "kalakriti-invite-gate-edited@pi-dash.test",
] as const;

async function cleanupEmail(email: string) {
  const invited = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!invited) {
    return;
  }
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.userId, invited.id));
  await db.delete(user).where(eq(user.id, invited.id));
}

async function cleanup() {
  await Promise.all(EMAILS.map((email) => cleanupEmail(email)));
}

async function state() {
  const found = await Promise.all(
    EMAILS.map(async (candidateEmail) => {
      const invited = await db.query.user.findFirst({
        columns: { banned: true, id: true, role: true },
        where: eq(user.email, candidateEmail),
      });
      return { email: candidateEmail, invited };
    })
  );
  const match = found.find((entry) => entry.invited);
  if (!match?.invited) {
    return null;
  }
  const { email, invited } = match;
  const [identity, membership] = await Promise.all([
    db.query.kalakritiExternalIdentity.findFirst({
      columns: { userId: true },
      where: eq(kalakritiExternalIdentity.userId, invited.id),
    }),
    db.query.kalakritiEditionMembership.findFirst({
      columns: { snapshotEmail: true, snapshotName: true, state: true },
      where: eq(kalakritiEditionMembership.userId, invited.id),
    }),
  ]);
  return {
    banned: invited.banned,
    email,
    externalIdentity: Boolean(identity),
    membershipEmail: membership?.snapshotEmail ?? null,
    membershipName: membership?.snapshotName ?? null,
    membershipState: membership?.state ?? null,
    role: invited.role,
  };
}

const [action] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "state") {
  result = await state();
} else {
  throw new Error(
    `Unsupported Guardian invite fixture action: ${action ?? ""}`
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
