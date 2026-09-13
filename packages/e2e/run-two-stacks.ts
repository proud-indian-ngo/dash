import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { partitionSpecs } from "./partition-specs";
import { createStackSnapshot } from "./stack-workspace";

const started = performance.now();
const root = path.resolve(import.meta.dirname, "../..");
const runDir = mkdtempSync(path.join(tmpdir(), "pi-dash-e2e-stacks-"));
console.log(`Two-stack artifacts: ${runDir}`);

const listing = execFileSync(
  "bunx",
  [
    "playwright",
    "test",
    "--config",
    "packages/e2e/playwright.config.ts",
    "--list",
    "--reporter=list",
  ],
  { cwd: root, encoding: "utf8" }
);
const lines = listing
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("["));
const durationsFile = path.join(root, "packages/e2e/.test-durations.json");
const durations: Record<string, number> = existsSync(durationsFile)
  ? JSON.parse(readFileSync(durationsFile, "utf8"))
  : {};
const stacks = partitionSpecs(lines, durations);
const expected = new Set(lines.filter((line) => !line.startsWith("[setup]")));
const assigned = stacks.flatMap((stack) => stack.lines);
if (
  expected.size === 0 ||
  assigned.length !== expected.size ||
  new Set(assigned).size !== expected.size ||
  assigned.some((line) => !expected.has(line))
) {
  throw new Error(
    "Stack partition must cover every non-setup case exactly once"
  );
}
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" }
    )
      .split("\0")
      .filter((file) => file && existsSync(path.join(root, file)))
  ),
];
const worktreeId = execFileSync(
  "bash",
  ["-c", "source scripts/worktree-ports.sh; get_worktree_id"],
  {
    cwd: root,
    encoding: "utf8",
  }
).trim();

for (const [index, stack] of stacks.entries()) {
  const dir = path.join(runDir, `stack-${index + 1}`);
  createStackSnapshot({ root, destination: dir, files, worktreeId });
  writeFileSync(path.join(dir, "test-list.txt"), `${stack.lines.join("\n")}\n`);
  console.log(
    `Stack ${index + 1}: ${stack.lines.length} cases, ${Math.round(stack.totalMs / 1000)} worker-seconds, ${Math.round(stack.invariantMs / 1000)} invariant-seconds estimated`
  );
}
writeFileSync(
  path.join(runDir, "partition.json"),
  JSON.stringify(stacks, null, 2)
);

const children: ReturnType<typeof spawn>[] = [];
let interrupted = false;
function interrupt() {
  interrupted = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (
          !(error instanceof Error && "code" in error && error.code === "ESRCH")
        ) {
          console.error("Failed to stop E2E stack", error);
        }
      }
    }
  }
}
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
const exits = await Promise.all(
  stacks.map(
    (_, index) =>
      new Promise<number>((resolve) => {
        const name = `stack-${index + 1}`;
        const log = openSync(path.join(runDir, `${name}.log`), "w");
        const child = spawn(
          "bash",
          [
            "packages/e2e/run-e2e.sh",
            "--workers=2",
            "--retries=0",
            "--trace=off",
            "--test-list=test-list.txt",
            "--reporter=list,json,./packages/e2e/duration-reporter.ts",
          ],
          {
            cwd: path.join(runDir, name),
            detached: true,
            env: {
              ...process.env,
              E2E_SERVER: "production",
              E2E_STACK_INDEX: String(index + 1),
              PLAYWRIGHT_HTML_OPEN: "never",
              PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(runDir, `${name}.json`),
            },
            stdio: ["ignore", log, log],
          }
        );
        closeSync(log);
        children.push(child);
        child.once("error", (error) => {
          console.error(`${name} failed to start`, error);
          interrupt();
          resolve(1);
        });
        child.once("close", (code) => {
          console.log(`${name} exited ${code ?? 1}`);
          resolve(code ?? 1);
        });
      })
  )
);
process.removeListener("SIGINT", interrupt);
process.removeListener("SIGTERM", interrupt);
const totalSeconds = (performance.now() - started) / 1000;
const summary = {
  totalSeconds,
  exits,
  stacks: stacks.map((stack, index) => {
    const report = path.join(runDir, `stack-${index + 1}.json`);
    return {
      selectedCases: stack.lines.length,
      stats: existsSync(report)
        ? JSON.parse(readFileSync(report, "utf8")).stats
        : null,
    };
  }),
};
writeFileSync(
  path.join(runDir, "summary.json"),
  JSON.stringify(summary, null, 2)
);
console.log(
  `Two-stack total: ${totalSeconds.toFixed(2)}s (including snapshots, builds, and teardown)`
);
console.log(`Summary: ${path.join(runDir, "summary.json")}`);
process.exitCode = interrupted || exits.some((code) => code !== 0) ? 1 : 0;
