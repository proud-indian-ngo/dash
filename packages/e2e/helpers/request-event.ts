import type { Page } from "@playwright/test";

/**
 * Seeded Bangalore event in the Unallocated programme, used to check a
 * request's derived programme and city (a request on an event takes both
 * from it).
 */
export const PROGRAMME_EVENT = {
  city: "Bangalore",
  name: "E2E Upcoming Public Bangalore",
  programme: "Unallocated",
} as const;

/**
 * Picks an event in a reimbursement or vendor payment form. The request
 * takes the event's city, so the form asks for none.
 */
export async function selectRequestEvent(page: Page, eventName: string) {
  const eventInput = page.getByRole("combobox", { name: "Event" });
  await eventInput.click();
  await eventInput.fill(eventName);
  await page.getByRole("option").filter({ hasText: eventName }).first().click();
}

/** How a test request is charged: to an event (by name; `city` is the event's) or a programme. */
export type ChargeOption =
  | { city?: string; name: string }
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
