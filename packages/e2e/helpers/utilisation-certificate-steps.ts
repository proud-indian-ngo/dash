import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { waitForZeroReady } from "../fixtures/test";

/** Steps the utilisation certificate specs share; fixtures in `utilisation-certificates.ts`. */

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "./utilisation-certificates.ts"
);

export async function fixture<T>(...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

interface Grant {
  grantId: string;
  grantor: string;
  reference: string;
  title: string;
}

export const newGrant = (kind: "csr" | "specific_grant" = "csr") =>
  fixture<Grant>(
    "grant",
    `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    kind
  );

export const newCertificate = (
  grantId: string,
  status: "awaiting_head" | "awaiting_finance" | "final",
  from: string,
  to: string,
  variant?: "drift" | "wrong-office"
) =>
  fixture<{ id: string; number: string }>(
    "certificate",
    grantId,
    status,
    from,
    to,
    ...(variant ? [variant] : [])
  );

export async function openGrant(page: Page, grantId: string) {
  await page.goto(`/finance/grants/${grantId}`);
  await waitForZeroReady(page);
}

/** Opens Prepare certificate on the grant page and fills the place. */
export async function openPrepare(page: Page) {
  await page.getByRole("button", { name: "Prepare certificate" }).click();
  const dialog = page.getByRole("dialog", { name: "Prepare certificate" });
  await dialog.getByRole("textbox", { name: "Place" }).fill("Bengaluru");
  return dialog;
}
