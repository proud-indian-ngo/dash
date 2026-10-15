import type { Page } from "@playwright/test";

/** Seeded Bangalore event in the Unallocated programme, used to check a request's derived programme. */
export const PROGRAMME_EVENT = {
  city: "Bangalore",
  name: "E2E Upcoming Public Bangalore",
  programme: "Unallocated",
} as const;

/** Picks the request's city, then an event from that city, in a reimbursement or vendor payment form. */
export async function selectRequestEvent(
  page: Page,
  eventName: string,
  city: string
) {
  await page.getByLabel("City").click();
  await page.getByRole("option", { name: city }).click();
  const eventInput = page.getByRole("combobox", { name: "Event" });
  await eventInput.click();
  await eventInput.fill(eventName);
  await page.getByRole("option").filter({ hasText: eventName }).first().click();
}

/** How a test request is charged: to an event (by city and name) or a programme. */
export type ChargeOption =
  | { city: string; name: string }
  | { programme: string };

/** The "Charged to" choices on the reimbursement and vendor payment forms. */
export type ChargeTarget = "Event" | "Organisation (admin)" | "Programme";

/** Picks what a request is charged to in its form or the change dialog. */
export async function chargeRequestTo(
  page: Page,
  target: ChargeTarget
): Promise<void> {
  await page.getByRole("button", { exact: true, name: target }).click();
}

/** Charges a request to a programme, picked by name, without an event. */
export async function chargeRequestToProgramme(
  page: Page,
  programme: string
): Promise<void> {
  await chargeRequestTo(page, "Programme");
  // Required fields carry " *" in their accessible name.
  const input = page.getByRole("combobox", { name: /^Programme\b/ });
  await input.click();
  await input.fill(programme);
  await page.getByRole("option", { exact: true, name: programme }).click();
}
