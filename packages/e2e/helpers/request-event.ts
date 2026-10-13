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
