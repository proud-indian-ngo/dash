import path from "node:path";
import { test as base, expect } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../.env.test"),
  quiet: true,
});

export const test = base.extend<{
  adminEmail: string;
  volunteerEmail: string;
  consoleErrors: Error[];
}>({
  adminEmail: process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
  volunteerEmail: process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test",
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      if (errors.length > 0) {
        for (const error of errors) {
          testInfo.annotations.push({
            type: "browser-error",
            description: error.message,
          });
        }
        // Uncomment the line below to promote to hard failure:
        // expect(errors, "Uncaught browser errors detected").toHaveLength(0);
      }
    },
    { auto: true },
  ],
});

export { expect };
