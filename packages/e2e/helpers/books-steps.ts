import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect } from "../fixtures/test";
import { clickPageAction } from "./page-header";

/** The financial year the books specs post into, close and reopen. */
export const BOOKS_YEAR = "2026-27";

const execFileAsync = promisify(execFile);

async function runStep<T>(script: string, args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", path.resolve(import.meta.dirname, script), ...args],
    { env: process.env, maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(stdout.trim()) as T;
}

/** Runs a step of `helpers/books.ts` against the test database. */
export function books<T = Record<string, string>>(
  ...args: string[]
): Promise<T> {
  return runStep<T>("books.ts", args);
}

/** Runs a step of `helpers/audit-pack.ts` against the test database. */
export function auditPack<T>(...args: string[]): Promise<T> {
  return runStep<T>("audit-pack.ts", args);
}

/** Runs a step of `helpers/utilisation-certificates.ts`. */
export function certificateFixture<T>(...args: string[]): Promise<T> {
  return runStep<T>("utilisation-certificates.ts", args);
}

/** Books → Post pending, waiting for its result. */
export async function postPending(page: Page) {
  await clickPageAction(page, "Post pending");
  await expect(
    page.getByText(/^(Posted: |The books are up to date)/).first()
  ).toBeVisible({ timeout: 30_000 });
}
