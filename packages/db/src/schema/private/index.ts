/**
 * Server-only tables. Keep this barrel out of `../index.ts`: drizzle-kit reads
 * the whole schema directory for migrations, but drizzle-zero reads only
 * `../index.ts`, so anything exported from here never reaches the browser.
 */
export * from "./email-batch-recipients";
export * from "./email-suppression";
export * from "./party-private";
export * from "./vendor-legacy";
