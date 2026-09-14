import * as schema from "@pi-dash/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { expect, it } from "vitest";

const databaseUrl = process.env.AUTH_SCHEMA_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//.test(
    databaseUrl
  );

// Temporary tables exercise the migrated schema without modifying product rows.
it.skipIf(!localDatabase)(
  "creates a credential account and signs in against the migrated schema",
  async () => {
    const client = new SQL(databaseUrl!, { max: 1 });
    try {
      for (const table of ["user", "account", "session", "verification"]) {
        await client.unsafe(
          `CREATE TEMPORARY TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`
        );
      }
      const auth = betterAuth({
        baseURL: "http://localhost:3000",
        database: drizzleAdapter(drizzle({ client, schema }), {
          provider: "pg",
          schema,
        }),
        emailAndPassword: { enabled: true },
        secret: "account-schema-integration-test-secret-only",
      });
      const credentials = {
        email: "account-schema@example.test",
        password: "test-account-password-123",
      };
      const registered = await auth.api.signUpEmail({
        body: { ...credentials, name: "Account schema test" },
      });
      const signedIn = await auth.api.signInEmail({ body: credentials });
      expect(signedIn.user.id).toBe(registered.user.id);
      const accounts = await client`
        SELECT provider_id, account_id FROM pg_temp.account
      `;
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toEqual({
        account_id: registered.user.id,
        provider_id: "credential",
      });
      await expect(client`
        INSERT INTO pg_temp.account (id, user_id, provider_id, account_id, updated_at)
        VALUES ('duplicate', ${registered.user.id}, 'credential', ${registered.user.id}, now())
      `).rejects.toThrow();
    } finally {
      await client.close();
    }
  }
);
