import { type Editor, KEYS, NodeApi, type Path, type TElement } from "platejs";

const LIST_TYPES = new Set<string>([KEYS.ulClassic, KEYS.olClassic]);
const ORDERED = new Set<string>([KEYS.olClassic]);

/** Lists of `types` among the nodes at `path` and above it. */
function listsAt(editor: Editor, path: Path, types: Set<string>): number {
  let count = 0;
  for (let i = 1; i <= path.length; i++) {
    const node = NodeApi.get<TElement>(editor, path.slice(0, i));
    if (node && types.has(node.type)) {
      count += 1;
    }
  }
  return count;
}

/** How deep in lists the node at `path` sits, counting itself. */
export function listDepthAt(editor: Editor, path: Path): number {
  return listsAt(editor, path, LIST_TYPES);
}

/**
 * The numbered lists the list at `path` sits in, for its numbering by the
 * shared rule (`orderedListStyle`): bulleted lists don't count.
 */
export function numberedListsAbove(editor: Editor, path: Path): number {
  return listsAt(editor, path.slice(0, -1), ORDERED);
}
