import { describe, expect, it } from "vitest";
import { appConfigQueries } from "./app-config";
import { eventFeedbackQueries } from "./event-feedback";
import { eventInterestQueries } from "./event-interest";
import { eventPhotoQueries } from "./event-photo";
import { eventUpdateQueries } from "./event-update";
import { expenseCategoryQueries } from "./expense-category";
import { scheduledMessageQueries } from "./scheduled-message";
import { teamQueries } from "./team";
import { vendorQueries } from "./vendor";
import { vendorPaymentTransactionQueries } from "./vendor-payment-transaction";
import { whatsappGroupQueries } from "./whatsapp-group";

const externalContext = {
  permissions: ["kalakriti.view"],
  role: "external_user",
  userId: "guardian-1",
};

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("external user query boundary", () => {
  it("denies organization-wide query surfaces", () => {
    const eventArgs = { eventId: "event-1" };
    const queries = [
      appConfigQueries.all.fn({ args: undefined, ctx: externalContext }),
      expenseCategoryQueries.all.fn({
        args: undefined,
        ctx: externalContext,
      }),
      scheduledMessageQueries.all.fn({
        args: undefined,
        ctx: externalContext,
      }),
      scheduledMessageQueries.byId.fn({
        args: { id: "message-1" },
        ctx: externalContext,
      }),
      whatsappGroupQueries.all.fn({
        args: undefined,
        ctx: externalContext,
      }),
      vendorQueries.all.fn({ args: undefined, ctx: externalContext }),
      vendorQueries.approved.fn({ args: undefined, ctx: externalContext }),
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: externalContext,
      }),
      vendorPaymentTransactionQueries.byVendorPayment.fn({
        args: { vendorPaymentId: "payment-1" },
        ctx: externalContext,
      }),
      teamQueries.all.fn({ args: undefined, ctx: externalContext }),
      teamQueries.byCurrentUser.fn({
        args: undefined,
        ctx: externalContext,
      }),
      teamQueries.byId.fn({
        args: { id: "team-1" },
        ctx: externalContext,
      }),
      eventFeedbackQueries.byEvent.fn({
        args: eventArgs,
        ctx: externalContext,
      }),
      eventInterestQueries.allPending.fn({
        args: undefined,
        ctx: externalContext,
      }),
      eventInterestQueries.managerByEvent.fn({
        args: eventArgs,
        ctx: externalContext,
      }),
      eventPhotoQueries.allPending.fn({
        args: undefined,
        ctx: externalContext,
      }),
      eventPhotoQueries.pendingByEvent.fn({
        args: eventArgs,
        ctx: externalContext,
      }),
      eventUpdateQueries.allPending.fn({
        args: undefined,
        ctx: externalContext,
      }),
      eventUpdateQueries.pendingByEvent.fn({
        args: eventArgs,
        ctx: externalContext,
      }),
    ];

    for (const query of queries) {
      expect(queryAst(query)).toContain('"value":"__never_match__"');
    }
  });
});
