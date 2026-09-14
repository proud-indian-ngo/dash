// Retain execution evidence without statement parameters, records or credentials.
export function summarizePostgresPlan(
  node: Record<string, unknown>
): Record<string, unknown> {
  const keys = [
    "Node Type",
    "Relation Name",
    "Index Name",
    "Actual Rows",
    "Actual Loops",
    "Actual Total Time",
    "Rows Removed by Filter",
    "Shared Hit Blocks",
    "Shared Read Blocks",
    "Temp Read Blocks",
    "Temp Written Blocks",
    "Sort Method",
    "Sort Space Used",
  ];
  return {
    ...Object.fromEntries(
      keys.filter((key) => key in node).map((key) => [key, node[key]])
    ),
    ...(Array.isArray(node.Plans)
      ? { Plans: node.Plans.map(summarizePostgresPlan) }
      : {}),
  };
}
