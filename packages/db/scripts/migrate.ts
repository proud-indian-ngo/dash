import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const DATABASE_URL = process.env.DATABASE_URL as string;
if (!DATABASE_URL) {
  process.stderr.write(
    "DATABASE_URL env var is required.\nUsage: DATABASE_URL=postgres://... bun run scripts/migrate.ts\n"
  );
  process.exit(1);
}

const migrationsFolder = resolve(import.meta.dir, "../src/migrations");
const MAX_RETRIES = 3;

async function run() {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const db = drizzle(DATABASE_URL);
      process.stdout.write(`Running migrations from ${migrationsFolder}...\n`);
      await migrate(db, { migrationsFolder });
      process.stdout.write("Migrations applied successfully.\n");
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        process.stdout.write(
          `Attempt ${attempt + 1} failed: ${message}. Retrying in ${delay}ms...\n`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${message}`);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(
      `Migration failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  });
