// Writes the PR evidence block from what `scripts/boat.sh verify` brought
// back from its sandboxes:
//
//   bun scripts/evidence/report.ts <dir> <base-sha> <head-sha>
//
// <dir> holds after/ and, for UI changes, before/ (capture.ts output), and
// e2e/results.json (Playwright's JSON report) with the recordings it names
// under e2e/test-results/. Writes <dir>/evidence.md, whose images and videos
// are local paths, and <dir>/attachments.txt listing them. When
// <dir>/pr-body.md holds the PR's description, evidence.md is that
// description with the block between the markers replaced, or inserted before
// its testing section, for `gh pr edit --body-file evidence.md --attach ...`
// to upload the files in place. The rest of the description is kept as is.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Capture } from "./types";

// GitHub's limits for one comment's attachments.
const MAX_FILES = 50;
const MAX_BYTES = 10 * 1024 * 1024;
const START = "<!-- evidence:start -->";
const END = "<!-- evidence:end -->";

interface TestResult {
  status: string;
  attachments: { name: string; path?: string }[];
}
interface Suite {
  title: string;
  file: string;
  suites?: Suite[];
  specs?: {
    title: string;
    tests: { projectName: string; status: string; results: TestResult[] }[];
  }[];
}

const [dir, base, head] = process.argv.slice(2);
if (!(dir && base && head)) {
  console.error("Usage: bun scripts/evidence/report.ts <dir> <base> <head>");
  process.exit(1);
}
const attachments: string[] = [];
const attach = (file: string) => {
  const ok =
    attachments.length < MAX_FILES &&
    statSync(path.join(dir, file)).size <= MAX_BYTES;
  if (ok) {
    attachments.push(file);
  }
  return ok;
};
const readJson = <T>(file: string): T | undefined =>
  existsSync(path.join(dir, file))
    ? JSON.parse(readFileSync(path.join(dir, file), "utf8"))
    : undefined;

const lines = [
  START,
  `## Evidence for ${head.slice(0, 9)}`,
  "",
  `Run on a Boat sandbox with seeded dev data. Before is the merge base, ${base.slice(0, 9)}.`,
];

const after = readJson<Capture[]>("after/manifest.json") ?? [];
const before = readJson<Capture[]>("before/manifest.json") ?? [];
const cell = (side: string, shot?: Capture) => {
  if (!shot) {
    return "Not captured";
  }
  if (!shot.file) {
    return `Failed: ${shot.error?.replaceAll("|", "\\|")}`;
  }
  const file = `${side}/${shot.file}`;
  return attach(file) ? `![${side}](${file})` : "Too many files to attach";
};
if (after.length > 0) {
  lines.push("", "### Screens");
  for (const shot of after) {
    const old = before.find(
      (b) => b.name === shot.name && b.viewport === shot.viewport
    );
    if (!old) {
      // A screen the branch adds.
      lines.push(
        "",
        `**${shot.name}**, ${shot.viewport}, new`,
        "",
        cell("after", shot)
      );
      continue;
    }
    lines.push(
      "",
      `**${shot.name}**, ${shot.viewport}`,
      "",
      "| Before | After |",
      "| --- | --- |",
      `| ${cell("before", old)} | ${cell("after", shot)} |`
    );
  }
}

const report = readJson<{ suites: Suite[] }>("e2e/results.json");
if (report) {
  const rows: string[] = [];
  const videos: string[] = [];
  const walk = (suite: Suite, titles: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        // A spec skips itself in the role projects it isn't for, and setup
        // only signs the test users in.
        if (test.status === "skipped" || test.projectName === "setup") {
          continue;
        }
        const title = [...titles, spec.title].join(" › ");
        const status = test.status === "expected" ? "passed" : test.status;
        rows.push(
          `| ${suite.file} | ${title} | ${test.projectName} | ${status} |`
        );
        const video = test.results
          .at(-1)
          ?.attachments.find((a) => a.name === "video" && a.path);
        const local = video?.path?.replace(
          /^.*\/test-results\//,
          "e2e/test-results/"
        );
        if (local && existsSync(path.join(dir, local))) {
          videos.push(
            attach(local)
              ? `<details><summary>${title} (${test.projectName})</summary>\n\n![](${local})\n\n</details>`
              : `${title} (${test.projectName}): recording too large or over the file limit.`
          );
        }
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, [...titles, child.title]);
    }
  };
  for (const suite of report.suites) {
    walk(suite, []);
  }
  lines.push(
    "",
    "### E2E",
    "",
    "| Spec | Test | Project | Result |",
    "| --- | --- | --- | --- |",
    ...rows
  );
  if (videos.length > 0) {
    lines.push("", "Recordings:", "", ...videos);
  }
}

lines.push(END);
const block = lines.join("\n");
const bodyFile = path.join(dir, "pr-body.md");
let body = existsSync(bodyFile) ? readFileSync(bodyFile, "utf8").trimEnd() : "";
const start = body.indexOf(START);
const end = body.indexOf(END);
if (start !== -1 && end > start) {
  body = body.slice(0, start) + block + body.slice(end + END.length);
} else {
  const testing = body.search(/^## (Verification|Testing|Test plan)\b/m);
  body =
    testing === -1
      ? [body, block].filter(Boolean).join("\n\n")
      : `${body.slice(0, testing)}${block}\n\n${body.slice(testing)}`;
}
writeFileSync(path.join(dir, "evidence.md"), `${body}\n`);
// One path per line, each ending in a newline, or `while read` drops the last.
writeFileSync(
  path.join(dir, "attachments.txt"),
  attachments.map((file) => `${file}\n`).join("")
);
