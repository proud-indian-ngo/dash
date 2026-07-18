import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { eq } from "drizzle-orm";

const EMAIL = "kalakriti-invite-gate@pi-dash.test";

async function cleanup() {
  const invited = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, EMAIL),
  });
  if (!invited) {
    return;
  }
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.userId, invited.id));
  await db.delete(user).where(eq(user.id, invited.id));
}

async function state() {
  const invited = await db.query.user.findFirst({
    columns: { banned: true, id: true, role: true },
    where: eq(user.email, EMAIL),
  });
  if (!invited) {
    return null;
  }
  const [identity, membership] = await Promise.all([
    db.query.kalakritiExternalIdentity.findFirst({
      columns: { userId: true },
      where: eq(kalakritiExternalIdentity.userId, invited.id),
    }),
    db.query.kalakritiEditionMembership.findFirst({
      columns: { state: true },
      where: eq(kalakritiEditionMembership.userId, invited.id),
    }),
  ]);
  return {
    banned: invited.banned,
    externalIdentity: Boolean(identity),
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
