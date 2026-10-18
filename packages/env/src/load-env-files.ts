import { parse } from "dotenv";
import { expand } from "dotenv-expand";

type Env = Record<string, string | undefined>;

/** Where a variable's value came from after `loadEnvFiles`. */
export type EnvSource = ".env" | ".env.worktree" | "environment";

function definedOnly(env: Env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/** A file's variables expanded against each other only. */
function expandAlone(parsed: Record<string, string>): Record<string, string> {
  return expand({ parsed: { ...parsed }, processEnv: {} }).parsed ?? {};
}

/**
 * Applies `.env`, then `.env.worktree`, to `env`, with this precedence:
 *
 * 1. Variables set explicitly in the environment (`DATABASE_URL=... bun run`)
 * 2. `.env.worktree`
 * 3. `.env`
 *
 * A variable already in `env` whose value is exactly what one of the files
 * gives counts as coming from that file, not as explicit: Bun loads `.env`
 * (automatically, or with `--env-file`) and `.env.worktree` (with
 * `--env-file`) into `process.env` before this runs, and child processes
 * inherit what their parent loaded. The one case this cannot tell apart is
 * an explicit value identical to `.env`'s, which `.env.worktree` then
 * overrides.
 *
 * Returns the source of each variable either file sets.
 */
export function loadEnvFiles(
  env: Env,
  files: { base?: string; worktree?: string }
): Map<string, EnvSource> {
  const sources = new Map<string, EnvSource>();
  const baseParsed = files.base ? parse(files.base) : {};
  const worktreeParsed = files.worktree ? parse(files.worktree) : {};

  // What the files give on their own, raw and expanded.
  const fileValues = [
    baseParsed,
    worktreeParsed,
    expandAlone(baseParsed),
    expandAlone({ ...baseParsed, ...worktreeParsed }),
  ];
  const explicit = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (
      value !== undefined &&
      !fileValues.some((parsed) => parsed[key] === value)
    ) {
      explicit.add(key);
    }
  }

  // Layer 0: .env fills what is not set, and references expand against the
  // environment. Explicit variables stay out of the expansion because
  // dotenv-expand replaces an empty value with the file's.
  const baseFills: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseParsed)) {
    if (!explicit.has(key)) {
      baseFills[key] = value;
    }
  }
  const afterBase = definedOnly(env);
  expand({ parsed: baseFills, processEnv: afterBase });
  for (const key of Object.keys(baseParsed)) {
    if (explicit.has(key)) {
      sources.set(key, "environment");
    } else {
      env[key] = afterBase[key];
      sources.set(key, ".env");
    }
  }

  // Layer 1: .env.worktree overrides .env, but not explicit variables. As
  // with dotenv `override: true` then expand, the raw worktree values
  // replace the old ones first, so references resolve to the new values.
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(worktreeParsed)) {
    if (!explicit.has(key)) {
      overrides[key] = value;
    }
  }
  const afterWorktree = { ...definedOnly(env), ...overrides };
  expand({ parsed: { ...overrides }, processEnv: afterWorktree });
  for (const key of Object.keys(worktreeParsed)) {
    if (explicit.has(key)) {
      sources.set(key, "environment");
    } else {
      env[key] = afterWorktree[key];
      sources.set(key, ".env.worktree");
    }
  }
  return sources;
}
