import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { role, rolePermission } from "@pi-dash/db/schema/permission";
import { eq, sql } from "drizzle-orm";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Job authorization fixtures require a local test database");
}
const [action, tag = "", jobId = ""] = process.argv.slice(2);
const roleId = `e2e_jobs_${tag}`;
const email = `jobs-${tag}@example.test`;
if (action === "setup") {
  await db.insert(role).values({ id: roleId, name: roleId, isSystem: false });
  await db
    .insert(rolePermission)
    .values({ roleId, permissionId: "jobs.manage" });
  const created = await auth.api.createUser({
    body: { email, name: "Job operator", password: "Jobs-test-password-123!" },
  });
  await db
    .update(user)
    .set({ role: roleId, emailVerified: true })
    .where(eq(user.id, created.user.id));
} else if (action === "fail") {
  await db.execute(
    sql`UPDATE pgboss.job SET state = 'failed', output = ${JSON.stringify({ error: "private failure output" })}::text::jsonb WHERE id = ${jobId}::uuid`
  );
} else if (action === "inspect") {
  const rows = await db.execute(
    sql`SELECT data FROM pgboss.job_common WHERE id = ${jobId}::uuid`
  );
  process.stdout.write(JSON.stringify(rows[0]));
} else if (action === "clear") {
  if (jobId)
    await db.execute(sql`DELETE FROM pgboss.job WHERE id = ${jobId}::uuid`);
  await db.delete(user).where(eq(user.email, email));
  await db.delete(role).where(eq(role.id, roleId));
} else {
  throw new Error("Unsupported fixture action");
}
process.exit(0);
