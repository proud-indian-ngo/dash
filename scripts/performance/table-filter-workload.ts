import { compileFilterQuery } from "../../apps/web/src/components/data-table/compile-filter-query";
import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
} from "../../packages/design-system/components/reui/filters/filters-query";

const ROW_COUNT = 5_000;
const NOW = new Date("2026-10-21T12:00:00.000Z");

type WorkloadRow = {
  amount: number;
  date: string;
  status: string;
  tags: string[];
};

export type TableFilterWorkloadResult = {
  durationMs: number;
  matches: number;
  passes: number;
  rows: number;
};

const rule = (id: string, operator: string, value: unknown) =>
  createFilterRule({ id, operator, path: [id], value });

const query = createFilterQuery([
  rule("status", "is_any_of", ["pending", "approved", "paid"]),
  createFilterGroup({
    combinator: "or",
    id: "tags-or-amount",
    rules: [
      rule("tags", "has_any_of", ["travel", "food", "supplies"]),
      rule("amount", "gte", 150),
    ],
  }),
  rule("date", "between", [
    { relative: { offset: -30, unit: "day" } },
    { relative: { offset: 0, unit: "day" } },
  ]),
]);

const rows: WorkloadRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
  amount: index % 300,
  date: `2026-10-${String((index % 20) + 1).padStart(2, "0")}`,
  status: ["pending", "approved", "paid", "rejected"][index % 4]!,
  tags: index % 2 === 1 ? ["travel", "food"] : ["other"],
}));

Object.assign(globalThis, {
  tableFilterBenchmark(passes: number): TableFilterWorkloadResult {
    const startedAt = performance.now();
    let matches = 0;
    for (let pass = 0; pass < passes; pass++) {
      const predicate = compileFilterQuery(
        query,
        (row: WorkloadRow, path) => row[path[0]! as keyof WorkloadRow],
        NOW
      );
      matches += rows.filter(predicate).length;
    }
    return {
      durationMs: performance.now() - startedAt,
      matches,
      passes,
      rows: rows.length,
    };
  },
});
