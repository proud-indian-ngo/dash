import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
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
      teamEvent: [{ costCentreId: "mum", id: "e1" }],
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
        "e1"
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
