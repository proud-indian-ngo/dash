import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type QueryResult = {
  data: null | Record<string, unknown>;
  type: "complete" | "unknown";
};

let reimbursement: QueryResult = { data: null, type: "unknown" };
let advancePayment: QueryResult = { data: null, type: "unknown" };

mock.module("@pi-dash/zero/queries", () => ({
  queries: {
    reimbursement: {
      byId: ({ id }: { id: string }) => ({ id, kind: "reimbursement" }),
    },
    advancePayment: {
      byId: ({ id }: { id: string }) => ({ id, kind: "advancePayment" }),
    },
  },
}));
mock.module("@rocicorp/zero/react", () => ({
  useQuery: ({ kind }: { kind: "reimbursement" | "advancePayment" }) => {
    const result = kind === "reimbursement" ? reimbursement : advancePayment;
    return [result.data, { type: result.type }];
  },
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ id: "request-id" }),
    useRouteContext: () => ({ session: { user: { id: "owner-id" } } }),
    useSearch: () => ({}),
  }),
  useNavigate: () => () => undefined,
}));
mock.module("@/components/loader", () => ({
  Loader: () => <span>Loading request</span>,
}));
mock.module("@/components/reimbursements/reimbursement-detail", () => ({
  ReimbursementDetail: ({ request }: { request: { title: string } }) => (
    <span>{request.title}</span>
  ),
}));
mock.module("@/components/reimbursements/reimbursement-form", () => ({
  ReimbursementForm: () => null,
}));
mock.module("@/context/app-context", () => ({
  useApp: () => ({ hasPermission: () => false }),
}));
mock.module("@/lib/request-edit-permissions", () => ({
  canEditRequestSubmission: () => false,
}));

const { Route } = await import("./$id");
const Component = Route.options.component as ComponentType;
const render = () => renderToStaticMarkup(<Component />);

beforeEach(() => {
  reimbursement = { data: null, type: "unknown" };
  advancePayment = { data: null, type: "unknown" };
});

describe("reimbursement detail loading", () => {
  it.each(["reimbursement", "advancePayment"] as const)(
    "keeps loading after an empty %s lookup while the other is pending",
    (completed) => {
      if (completed === "reimbursement") {
        reimbursement.type = "complete";
      } else {
        advancePayment.type = "complete";
      }

      const html = render();
      expect(html).toContain("Loading request");
      expect(html).not.toContain("Reimbursement not found.");
    }
  );

  it("shows not found after both empty lookups complete", () => {
    reimbursement.type = "complete";
    advancePayment.type = "complete";

    const html = render();
    expect(html).toContain("Reimbursement not found.");
    expect(html).not.toContain("Loading request");
  });

  it.each(["reimbursement", "advancePayment"] as const)(
    "renders a cached %s while both lookups are resyncing",
    (kind) => {
      if (kind === "reimbursement") {
        reimbursement.data = {
          id: "request-id",
          title: "Cached reimbursement",
          userId: "owner-id",
          expenseDate: "2026-09-01",
        };
      } else {
        advancePayment.data = {
          id: "request-id",
          title: "Cached advance payment",
          userId: "owner-id",
        };
      }

      const html = render();
      expect(html).toContain(
        kind === "reimbursement"
          ? "Cached reimbursement"
          : "Cached advance payment"
      );
      expect(html).not.toContain("Loading request");
      expect(html).not.toContain("Reimbursement not found.");
    }
  );
});
