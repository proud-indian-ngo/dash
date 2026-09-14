import { describe, expect, it } from "bun:test";

import { reimbursementQueries } from "./reimbursement";
import { vendorPaymentQueries } from "./vendor-payment";

function ast(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("event expense scope", () => {
  for (const [name, queries] of [
    ["reimbursement", reimbursementQueries],
    ["vendor payment", vendorPaymentQueries],
  ] as const) {
    it(`${name} keeps the event filter and permission-dependent ownership`, () => {
      for (const permissions of [[], ["requests.view_all"]]) {
        const value = ast(
          queries.byEvent.fn({
            args: { eventId: "selected-event" },
            ctx: { userId: "expense-owner", role: "volunteer", permissions },
          })
        );
        expect(value).toContain('"value":"selected-event"');
        if (permissions.length === 0) {
          expect(value).toContain('"value":"expense-owner"');
        } else {
          expect(value).not.toContain('"value":"expense-owner"');
        }
        expect(value).toContain('"alias":"lineItems"');
        expect(value).toContain('"alias":"user"');
        expect(value).not.toContain('"alias":"history"');
        expect(value).not.toContain('"alias":"attachments"');
        expect(value).not.toContain('"alias":"transactions"');
      }
      const detail = ast(
        queries.byId.fn({
          args: { id: "expense" },
          ctx: { userId: "expense-owner", role: "volunteer", permissions: [] },
        })
      );
      expect(detail).toContain('"alias":"history"');
      expect(detail).toContain('"alias":"attachments"');
    });
  }
});
