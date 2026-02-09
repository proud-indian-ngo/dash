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
}>({
  adminEmail: process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
  volunteerEmail: process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test",
});

export { expect };
