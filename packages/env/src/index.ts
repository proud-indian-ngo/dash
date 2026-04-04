import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

// Layer 0: Load base .env
const envPath = findUp(".env", process.cwd());
if (envPath) {
  expand(config({ path: envPath, quiet: true }));
}

// Layer 1: Explicit .env.worktree overrides (from worktree:setup script)
// Skip when VITE_E2E is set — run-e2e.sh already exported correct port overrides
// and .env.worktree contains dev ports that would clobber the E2E values.
const worktreeEnvPath = findUp(".env.worktree", process.cwd());
if (worktreeEnvPath && !process.env.VITE_E2E) {
  expand(config({ path: worktreeEnvPath, override: true, quiet: true }));
} else if (!process.env.WORKTREE_ID) {
  // Layer 2: Auto-detect git worktree and compute ports from path hash.
  // This makes `claude --worktree` and `isolation: "worktree"` work with zero setup.
  autoDetectWorktreePorts();
}

function autoDetectWorktreePorts(): void {
  try {
    // Fast-path: check for .worktree-id file before shelling out to git
    const worktreeIdPath = findUp(".worktree-id", process.cwd());
    let id: number;

    if (worktreeIdPath) {
      id = Number.parseInt(readFileSync(worktreeIdPath, "utf8").trim(), 10);
      if (Number.isNaN(id) || id < 1 || id > 9) {
        return;
      }
    } else {
      const toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      const porcelain = execFileSync(
        "git",
        ["worktree", "list", "--porcelain"],
        {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      const mainWorktree = porcelain.split("\n")[0]?.replace("worktree ", "");

      if (!mainWorktree || toplevel === mainWorktree) {
        return;
      }

      // We're in a worktree — compute deterministic ID from path hash using
      // cksum (CRC-32) to match scripts/worktree-ports.sh get_worktree_id().
      // Note: echo adds a trailing newline, which cksum includes in its input.
      // WARNING: Only 9 possible IDs (1-9). Two worktrees have ~11% collision
      // chance. For reliable isolation, use `bun run worktree:setup <ID>` instead.
      const cksumOutput = execFileSync("cksum", {
        encoding: "utf8",
        input: `${toplevel}\n`,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const hash = Number.parseInt(cksumOutput.split(" ")[0] ?? "0", 10);
      id = (hash % 9) + 1;
    }

    const offset = id * 10;
    const webPort = 3001 + offset;
    const zeroPort = 4848 + offset;

    process.env.WORKTREE_ID ??= String(id);
    process.env.DEV_WEB_PORT ??= String(webPort);
    process.env.ZERO_PORT ??= String(zeroPort);
    process.env.BETTER_AUTH_URL ??= `http://localhost:${webPort}`;
    process.env.CORS_ORIGIN ??= `http://localhost:${webPort}`;
    process.env.ZERO_MUTATE_URL ??= `http://localhost:${webPort}/api/zero/mutate`;
    process.env.ZERO_QUERY_URL ??= `http://localhost:${webPort}/api/zero/query`;
    process.env.VITE_ZERO_URL ??= `http://localhost:${zeroPort}`;
    process.env.ZERO_REPLICA_FILE ??= `/tmp/pi-dash-wt${id}.db`;
    process.env.ZERO_APP_ID ??= `zero_wt${id}`;
  } catch {
    // Not in a git repo or git not available — ignore
  }
}

function findUp(name: string, from: string): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
