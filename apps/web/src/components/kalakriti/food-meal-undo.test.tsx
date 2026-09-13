import { beforeEach, describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

let online = true;
let lifecycle = "live";
let authoritative = true;
let fail = false;
let queryIndex = 0;
let liveRole = "food_lead";
let membershipComplete = true;
let resolvePending: ((value: { type: string }) => void) | undefined;
let defer = false;
let table: any;
let dialog: any;
let options: any;
let payload: any;
let cancelled = false;
const requests: any[] = [];
mock.module("@rocicorp/zero/react", () => ({
  useConnectionState: () => ({ name: online ? "connected" : "disconnected" }),
  useQuery: () =>
    queryIndex++ === 0
      ? [
          { id: "edition", lifecycle },
          { type: authoritative ? "complete" : "unknown" },
        ]
      : [
          {
            kind: "volunteer",
            assignments: [{ responsibility: liveRole, centerId: null }],
          },
          { type: membershipComplete ? "complete" : "unknown" },
        ],
  useZero: () => ({
    mutate: (request: any) => {
      requests.push(request);
      return {
        server: defer
          ? new Promise((resolve) => {
              resolvePending = resolve;
            })
          : fail
            ? Promise.reject(new Error("uncertain"))
            : Promise.resolve({ type: "success" }),
      };
    },
  }),
}));
mock.module("@/hooks/use-confirm-action", () => ({
  useConfirmAction: (input: any) => {
    options = input;
    return {
      payload,
      isOpen: false,
      isLoading: false,
      trigger: (value: any) => {
        payload = value;
      },
      cancel: () => {
        cancelled = true;
      },
      confirm: () => options.onConfirm(payload),
    };
  },
}));
mock.module("./food-table", () => ({
  FoodTable: (props: any) => {
    table = props;
    return null;
  },
}));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: (props: any) => {
    dialog = props;
    return null;
  },
}));
mock.module("evlog", () => ({ log: { error: () => undefined } }));
const { FoodMealUndo } = await import("./food-meal-undo");
const target = {
  personName: "Person",
  meal: "breakfast" as const,
  targetOperationId: "served",
};
function render(
  role = "food_lead",
  complete = true,
  currentRole = role,
  onMealSettled?: () => Promise<void>
) {
  queryIndex = 0;
  liveRole = currentRole;
  const access = {
    edition: { id: "edition", year: 2026, lifecycle: "live" },
    isGlobalAdmin: false,
    membership: {
      kind: "volunteer",
      assignments: [{ responsibility: role, centerId: null }],
    },
  } as KalakritiEditionAccess;
  renderToStaticMarkup(
    <FoodMealUndo
      access={access}
      onMealSettled={onMealSettled}
      data={[
        {
          id: "person",
          name: "Person",
          kind: "guardian",
          state: "active",
          humanId: null,
          centers: [],
          operations: [
            { id: "served", type: "breakfast", supersededByOperationId: null },
          ],
        },
      ]}
      complete={complete}
      scopeKey="scope"
    />
  );
}
beforeEach(() => {
  online = true;
  membershipComplete = true;
  lifecycle = "live";
  authoritative = true;
  fail = false;
  defer = false;
  payload = undefined;
  cancelled = false;
  requests.length = 0;
  resolvePending = undefined;
});
describe("Food meal undo confirmation", () => {
  it.each([false, true])(
    "awaits refresh after mutation (uncertain: %s), then releases pending even if refresh fails",
    async (uncertain) => {
      fail = uncertain;
      let rejectRefresh: ((error: Error) => void) | undefined;
      let refreshed = false;
      render("food_lead", true, "food_lead", () => {
        refreshed = true;
        return new Promise<void>((_resolve, reject) => {
          rejectRefresh = reject;
        });
      });
      table.onUndoMeal(target);
      const attempt = options.onConfirm(payload);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(refreshed).toBe(true);
      expect((await options.onConfirm(payload)).type).toBe("error");
      expect(requests).toHaveLength(1);
      rejectRefresh!(new Error("refresh failed"));
      expect((await attempt).type).toBe(uncertain ? "error" : "success");
      dialog.onOpenChange(false);
      expect(cancelled).toBe(true);
    }
  );
  it("exposes undo only to Food Leads/admin, never Food Members/readers", () => {
    for (const role of ["food_member", "liaison_lead"]) {
      render(role);
      expect(table.onUndoMeal).toBeUndefined();
    }
    render();
    expect(table.onUndoMeal).toBeFunction();
    expect(dialog.title).toBe("Undo served meal?");
    expect(dialog.confirmLabel).toBe("Undo meal");
  });
  it("revokes undo after a live role downgrade even when route access and Food rows are unchanged", async () => {
    render("food_lead");
    table.onUndoMeal(target);
    expect(payload).toBeDefined();
    render("food_lead", true, "food_member");
    expect(table.onUndoMeal).toBeUndefined();
    expect(dialog.confirmDisabled).toBe(true);
    await options.onConfirm(payload);
    expect(requests).toHaveLength(0);
    membershipComplete = false;
    render("food_lead");
    expect(table.onUndoMeal).toBeUndefined();
  });
  it("gates attempts on Live, connectivity and authoritative snapshots", () => {
    online = false;
    render();
    table.onUndoMeal(target);
    expect(payload).toBeUndefined();
    online = true;
    render("food_lead", false);
    table.onUndoMeal(target);
    expect(payload).toBeUndefined();
    authoritative = false;
    render();
    table.onUndoMeal(target);
    expect(payload).toBeUndefined();
    lifecycle = "draft";
    render();
    expect(table.onUndoMeal).toBeUndefined();
    expect(requests).toHaveLength(0);
  });
  it("cancels without mutation and preserves exact args for uncertain retries", async () => {
    render();
    table.onUndoMeal(target);
    dialog.onOpenChange(false);
    expect(cancelled).toBe(true);
    expect(requests).toHaveLength(0);
    fail = true;
    const first = await options.onConfirm(payload);
    expect(first.type).toBe("error");
    fail = false;
    await options.onConfirm(payload);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(payload.args.targetOperationId).toBe("served");
  });
  it("blocks repeated confirms and close while the request is pending", async () => {
    render();
    table.onUndoMeal(target);
    defer = true;
    const pending = options.onConfirm(payload);
    dialog.onConfirm();
    dialog.onOpenChange(false);
    expect(cancelled).toBe(false);
    expect(requests).toHaveLength(1);
    resolvePending?.({ type: "success" });
    await pending;
  });
});
