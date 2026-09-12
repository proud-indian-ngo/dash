export type ScopeRow = Record<string, string | boolean | null>;
export type ScopeTables = Record<string, ScopeRow[]>;
export interface ScopeAst {
  table: string;
  where?: ScopeCondition;
  related?: { subquery: ScopeAst & { alias: string } }[];
}
type ScopeCondition =
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: unknown };
    }
  | { type: "and" | "or"; conditions: ScopeCondition[] }
  | {
      type: "correlatedSubquery";
      op: string;
      related: {
        correlation: { parentField: string[]; childField: string[] };
        subquery: ScopeAst;
      };
    };

export function matchesScope(
  row: ScopeRow,
  condition: ScopeCondition | undefined,
  tables: ScopeTables
): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case "simple": {
      const value = row[condition.left.name];
      if (condition.op === "IN" && Array.isArray(condition.right.value))
        return condition.right.value.includes(value);
      if (condition.op === "=" || condition.op === "IS")
        return value === condition.right.value;
      if (condition.op === "!=" || condition.op === "IS NOT")
        return value !== condition.right.value;
      throw new Error(`Unsupported comparison ${condition.op}`);
    }
    case "and":
      return condition.conditions.every((child) =>
        matchesScope(row, child, tables)
      );
    case "or":
      return condition.conditions.some((child) =>
        matchesScope(row, child, tables)
      );
    case "correlatedSubquery": {
      if (condition.op !== "EXISTS")
        throw new Error(`Unsupported subquery ${condition.op}`);
      const { correlation, subquery } = condition.related;
      return (tables[subquery.table] ?? []).some(
        (child) =>
          correlation.parentField.every(
            (field, index) =>
              row[field] === child[correlation.childField[index]!]
          ) && matchesScope(child, subquery.where, tables)
      );
    }
  }
}
