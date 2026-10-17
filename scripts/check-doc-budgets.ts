/**
 * Fails when a Markdown doc in the repository grows past its word budget, so
 * docs stay short enough to read in full. Run by `bun run check` and on commits that
 * touch Markdown. When a doc is over, cut or split it by subsystem; raise a
 * budget only when the doc cannot be split.
 *
 * A word is any whitespace-separated token with a letter or digit, so table
 * pipes and rules don't count.
 */
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_BUDGET = 3000;

const BUDGETS: Record<string, number> = {
  ".ruler/agent-guide.md": 1200,
  "README.md": 1200,
};

/** Third-party skills and agent definitions are not ours to trim. */
const IGNORED_PREFIXES = [".agents/", ".claude/"];

const WORD = /[\p{L}\p{N}]/u;

function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => WORD.test(token)).length;
}

/** Tracked and new (not ignored) Markdown files that exist on disk. */
function repoMarkdown(): string[] {
  const result = Bun.spawnSync([
    "git",
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "*.md",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
  return result.stdout
    .toString()
    .split("\n")
    .filter(Boolean)
    .filter((path) => !IGNORED_PREFIXES.some((p) => path.startsWith(p)))
    .filter((path) => existsSync(path));
}

if (import.meta.main) {
  const over = repoMarkdown()
    .map((path) => ({
      budget: BUDGETS[path] ?? DEFAULT_BUDGET,
      path,
      words: countWords(readFileSync(path, "utf8")),
    }))
    .filter(({ words, budget }) => words > budget);

  if (over.length > 0) {
    console.error(
      "Docs over their word budget (cut or split them by subsystem):"
    );
    for (const { path, words, budget } of over) {
      console.error(`  ${path}: ${words} words, budget ${budget}`);
    }
    process.exit(1);
  }
}
