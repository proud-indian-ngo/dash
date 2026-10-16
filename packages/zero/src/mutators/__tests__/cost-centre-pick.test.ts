import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  CLOSED_EVENT_CITY_MESSAGE,
  costCentreAfterRecharge,
  pickCostCentreId,
  pickRequestCostCentreId,
} from "../cost-centre-pick";

type Row = Record<string, unknown>;

function fakeTx(
  tables: Partial<Record<string, Row[]>>,
  location: "client" | "server" = "server"
) {
  const all: Record<string, Row[]> = {
    costCentre: [],
    teamEvent: [],
    ...tables,
  };
  return {
    location,
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      const result = (all[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          all as unknown as ScopeTables
        )
      );
      return query.format.singular ? result[0] : result;
    },
  } as never;
}

const BLR = { active: true, id: "blr" };
const MUM = { active: false, id: "mum" };
const DEL = { active: true, id: "del" };

describe("pickCostCentreId", () => {
  it("takes an active pick, and refuses an inactive or unknown one", async () => {
    const tx = fakeTx({ costCentre: [BLR, MUM] });
    expect(await pickCostCentreId(tx, "blr")).toBe("blr");
    await expect(pickCostCentreId(tx, "mum")).rejects.toThrow(
      "Choose an active city"
    );
    await expect(pickCostCentreId(tx, "nope")).rejects.toThrow(
      "City not found"
    );
  });

  it("lets an old record keep its inactive centre", async () => {
    const tx = fakeTx({ costCentre: [BLR, MUM] });
    expect(await pickCostCentreId(tx, "mum", "mum")).toBe("mum");
    expect(await pickCostCentreId(tx, undefined, "mum")).toBe("mum");
  });

  it("takes the only active centre without a pick, and asks with several", async () => {
    expect(
      await pickCostCentreId(fakeTx({ costCentre: [BLR, MUM] }), null)
    ).toBe("blr");
    await expect(
      pickCostCentreId(fakeTx({ costCentre: [BLR, DEL] }), null)
    ).rejects.toThrow("Choose the city");
    // The client may not hold the centres yet: the server decides.
    expect(
      await pickCostCentreId(fakeTx({ costCentre: [BLR, DEL] }, "client"), null)
    ).toBeNull();
  });
});

describe("linking a request to an event", () => {
  const tables = {
    costCentre: [BLR, MUM],
    teamEvent: [
      { costCentreId: "blr", id: "e-blr" },
      { costCentreId: "mum", id: "e-mum" },
    ],
  };

  it("refuses an event in a closed city, unless the request is already on it", async () => {
    const tx = fakeTx(tables);
    expect(await pickRequestCostCentreId(tx, { eventId: "e-blr" })).toBeNull();
    await expect(
      pickRequestCostCentreId(tx, { eventId: "e-mum" })
    ).rejects.toThrow(CLOSED_EVENT_CITY_MESSAGE);
    await expect(
      pickRequestCostCentreId(tx, { eventId: "e-mum" }, { eventId: "e-blr" })
    ).rejects.toThrow(CLOSED_EVENT_CITY_MESSAGE);
    expect(
      await pickRequestCostCentreId(
        tx,
        { eventId: "e-mum" },
        { costCentreId: null, eventId: "e-mum" }
      )
    ).toBeNull();
  });

  it("refuses finance re-charging onto an event in a closed city", async () => {
    const tx = fakeTx(tables);
    await expect(
      costCentreAfterRecharge(
        tx,
        { costCentreId: "blr", eventId: null },
        "e-mum"
      )
    ).rejects.toThrow(CLOSED_EVENT_CITY_MESSAGE);
    expect(
      await costCentreAfterRecharge(tx, { eventId: "e-mum" }, "e-mum")
    ).toBeNull();
  });

  it("leaves it to the server when the client has not synced the event", async () => {
    const tx = fakeTx({}, "client");
    expect(await pickRequestCostCentreId(tx, { eventId: "e-mum" })).toBeNull();
  });
});

describe("request cost centres", () => {
  it("store none on an event", async () => {
    const tx = fakeTx({ costCentre: [BLR] });
    expect(
      await pickRequestCostCentreId(tx, { costCentreId: "blr", eventId: "e1" })
    ).toBeNull();
    expect(await pickRequestCostCentreId(tx, { eventId: null })).toBe("blr");
  });

  it("keep the event's centre when finance moves a request off its event", async () => {
    const tx = fakeTx({
      costCentre: [BLR, MUM],
      teamEvent: [
        { costCentreId: "mum", id: "e1" },
        { costCentreId: "blr", id: "e2" },
      ],
    });
    expect(
      await costCentreAfterRecharge(
        tx,
        { costCentreId: null, eventId: "e1" },
        null
      )
    ).toBe("mum");
    expect(
      await costCentreAfterRecharge(
        tx,
        { costCentreId: "blr", eventId: null },
        "e2"
      )
    ).toBeNull();
    expect(
      await costCentreAfterRecharge(
        tx,
        { costCentreId: "mum", eventId: null },
        null
      )
    ).toBe("mum");
  });
});
