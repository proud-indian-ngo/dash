import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";
import { auth } from "./index";

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const getAdminCredentials = (): { email: string; password: string } => {
  if (!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD)) {
    throw new Error(
      "Missing ADMIN_EMAIL or ADMIN_PASSWORD in your environment. Set both in .env before running the seed script."
    );
  }

  return {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  };
};

const ensureAdminUser = async (): Promise<void> => {
  const { email, password } = getAdminCredentials();

  const existingUser = await db.query.user.findFirst({
    columns: {
      id: true,
      role: true,
    },
    where: (table, operators) => operators.eq(table.email, email),
  });

  if (!existingUser) {
    await auth.api.createUser({
      body: {
        email,
        name: "Admin",
        password,
      },
    });

    log(`Created user: ${email}`);
  }

  const userRecord = await db.query.user.findFirst({
    columns: {
      id: true,
      role: true,
    },
    where: (table, operators) => operators.eq(table.email, email),
  });

  if (!userRecord) {
    throw new Error(`Unable to find user record for ${email} after creation.`);
  }

  if (userRecord.role !== "super_admin") {
    await db
      .update(user)
      .set({ role: "super_admin" })
      .where(eq(user.id, userRecord.id));
    log(`Promoted user to super_admin: ${email}`);
    return;
  }

  log(`User already has super_admin role: ${email}`);
};

ensureAdminUser().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown error while seeding admin user.";

  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
