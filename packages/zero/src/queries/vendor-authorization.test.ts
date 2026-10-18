import { describe, expect, it } from "bun:test";

import { vendorQueries } from "./vendor";
import { vendorPaymentTransactionQueries } from "./vendor-payment-transaction";

function context(
  permissions: string[] = [],
  role = "volunteer",
  userId = "owner-1"
) {
  return { permissions, role, userId } as never;
}

function ast(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("vendor payment transaction query authorization", () => {
  it("denies anonymous and external viewers", () => {
    const queries = [
      vendorPaymentTransactionQueries.byVendorPayment.fn({
        args: { vendorPaymentId: "payment-1" },
        ctx: null as never,
      }),
      vendorPaymentTransactionQueries.byVendorPayment.fn({
        args: { vendorPaymentId: "payment-1" },
        ctx: context(["requests.view_all"], "external_user", "external-1"),
      }),
    ];

    for (const query of queries) {
      expect(ast(query)).toContain('"value":"__never_match__"');
    }
  });

  it("scopes a requester through the parent payment owner", () => {
    const query = ast(
      vendorPaymentTransactionQueries.byVendorPayment.fn({
        args: { vendorPaymentId: "payment-1" },
        ctx: context(),
      })
    );

    expect(query).toContain('"value":"payment-1"');
    expect(query).toContain('"table":"vendorPayment"');
    expect(query).toContain('"name":"userId"');
    expect(query).toContain('"value":"owner-1"');
    for (const relation of ["attachments", "history", "user"]) {
      expect(query).toContain(`"alias":"${relation}"`);
    }
  });

  it("allows requests.view_all without an owner restriction", () => {
    const query = ast(
      vendorPaymentTransactionQueries.byVendorPayment.fn({
        args: { vendorPaymentId: "payment-1" },
        ctx: context(["requests.view_all"], "finance_admin", "finance-1"),
      })
    );

    expect(query).toContain('"value":"payment-1"');
    expect(query).not.toContain('"table":"vendorPayment"');
    expect(query).not.toContain('"value":"finance-1"');
  });
});

describe("vendor byId query authorization", () => {
  it("denies anonymous and external viewers", () => {
    const queries = [
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: null as never,
      }),
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: context(["vendors.view_all"], "external_user", "external-1"),
      }),
    ];

    for (const query of queries) {
      expect(ast(query)).toContain('"value":"__never_match__"');
    }
  });

  it("allows approved vendors or the current user's pending vendor", () => {
    const query = ast(
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: context(),
      })
    );

    expect(query).toContain('"value":"vendor-1"');
    expect(query).toContain('"value":"approved"');
    expect(query).toContain('"value":"pending"');
    expect(query).toContain('"name":"createdBy"');
    expect(query).toContain('"value":"owner-1"');
  });

  it("requires vendors.view_all for unrestricted access", () => {
    const requestViewer = ast(
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: context(["requests.view_all"], "finance_admin", "finance-1"),
      })
    );
    const vendorViewer = ast(
      vendorQueries.byId.fn({
        args: { id: "vendor-1" },
        ctx: context(["vendors.view_all"], "admin", "admin-1"),
      })
    );

    expect(requestViewer).toContain('"value":"approved"');
    expect(requestViewer).toContain('"value":"finance-1"');
    expect(vendorViewer).toContain('"value":"vendor-1"');
    expect(vendorViewer).not.toContain('"value":"approved"');
    expect(vendorViewer).not.toContain('"name":"createdBy"');
  });
});
