interface PlateText {
  [key: string]: unknown;
  text: string;
}

interface PlateElement {
  [key: string]: unknown;
  children: (PlateElement | PlateText)[];
  type: string;
}

const MAX_DEPTH = 50;
const MAX_NODES = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStyleValue(value: unknown): boolean {
  return value == null || typeof value === "string" || isNumber(value);
}

function cellSpan(
  node: Record<string, unknown>,
  key: "colSpan" | "rowSpan"
): number {
  const attributes = isRecord(node.attributes) ? node.attributes : {};
  const value = node[key] ?? attributes[key.toLowerCase()] ?? 1;
  if (typeof value !== "string" && !isNumber(value)) return NaN;
  const span = Number(value);
  return Number.isInteger(span) && span > 0 && span <= MAX_NODES ? span : NaN;
}

/** Only properties read by the static renderer, not a schema of every plugin. */
function hasRenderableProperties(node: Record<string, unknown>): boolean {
  if (
    (node.id != null && typeof node.id !== "string") ||
    (node.indent != null && !isNumber(node.indent)) ||
    (node.className != null && typeof node.className !== "string")
  )
    return false;
  switch (node.type) {
    case "code_block":
      return node.lang == null || typeof node.lang === "string";
    case "mention":
      return typeof node.value === "string";
    case "a":
      return (
        typeof node.url === "string" &&
        (node.target == null || typeof node.target === "string")
      );
    case "img":
      return (
        typeof node.url === "string" &&
        isStyleValue(node.width) &&
        (node.align == null || typeof node.align === "string") &&
        (node.caption == null || Array.isArray(node.caption))
      );
    case "table": {
      if (
        !isStyleValue(node.marginLeft) ||
        (node.colSizes != null &&
          (!Array.isArray(node.colSizes) ||
            node.colSizes.length > MAX_NODES ||
            !node.colSizes.every(isNumber)))
      )
        return false;
      if (!Array.isArray(node.children)) return false;
      let cells = 0;
      for (const row of node.children) {
        if (!isRecord(row) || row.type !== "tr" || !Array.isArray(row.children))
          return false;
        for (const cell of row.children) {
          if (!isRecord(cell) || (cell.type !== "td" && cell.type !== "th"))
            return false;
          cells += cellSpan(cell, "colSpan") * cellSpan(cell, "rowSpan");
          if (!Number.isFinite(cells) || cells > MAX_NODES) return false;
        }
      }
      return true;
    }
    case "tr":
      return isStyleValue(node.size);
    case "td":
    case "th":
      return (
        isStyleValue(node.background) &&
        Number.isFinite(cellSpan(node, "colSpan")) &&
        Number.isFinite(cellSpan(node, "rowSpan"))
      );
    default:
      return true;
  }
}

/** Check tree and renderer invariants while preserving unknown plugin data. */
export function isPlateValue(value: unknown): value is PlateElement[] {
  if (!Array.isArray(value) || value.length > MAX_NODES) {
    return false;
  }
  const stack = value.map((node: unknown) => ({ depth: 0, node }));
  let nodes = value.length;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    const { depth, node } = current;
    if (
      depth > MAX_DEPTH ||
      !isRecord(node) ||
      !hasRenderableProperties(node)
    ) {
      return false;
    }
    if ("text" in node) {
      if (depth === 0 || typeof node.text !== "string" || "children" in node) {
        return false;
      }
      continue;
    }
    if (
      !("type" in node) ||
      typeof node.type !== "string" ||
      !("children" in node) ||
      !Array.isArray(node.children) ||
      node.children.length === 0
    ) {
      return false;
    }
    const children =
      node.type === "img" && Array.isArray(node.caption)
        ? [...node.children, ...node.caption]
        : node.children;
    nodes += children.length;
    if (nodes > MAX_NODES) {
      return false;
    }
    for (const child of children) {
      stack.push({ depth: depth + 1, node: child });
    }
  }
  return true;
}
