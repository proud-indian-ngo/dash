import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStackSnapshot } from "./stack-workspace";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("copies workspace files, environments, and links local dependencies into the snapshot", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "pi-dash-stack-snapshot-"));
  temporaryDirectories.push(temporary);
  const root = path.join(temporary, "source");
  const destination = path.join(temporary, "stack-1");
  const files = [
    "apps/web/package.json",
    "apps/web/src/index.ts",
    "apps/web/src/alias.ts",
    "packages/auth/package.json",
    "packages/auth/src/index.ts",
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    if (file !== "apps/web/src/alias.ts")
      writeFileSync(
        path.join(root, file),
        file.endsWith("package.json")
          ? JSON.stringify({
              name: file.startsWith("apps/") ? "@pi-dash/web" : "@pi-dash/auth",
            })
          : file
      );
  }
  symlinkSync("index.ts", path.join(root, "apps/web/src/alias.ts"));
  writeFileSync(path.join(root, ".env"), "LOCAL=one\n");
  writeFileSync(path.join(root, ".env.worktree"), "PORT=1234\n");
  mkdirSync(path.join(root, "node_modules/@pi-dash"), { recursive: true });
  symlinkSync(
    path.join(root, "packages/auth"),
    path.join(root, "node_modules/@pi-dash/auth"),
    "dir"
  );
  mkdirSync(path.join(root, "node_modules/external-package"), {
    recursive: true,
  });
  writeFileSync(
    path.join(root, "node_modules/external-package/index.js"),
    "external"
  );
  mkdirSync(path.join(root, "apps/web/node_modules/@pi-dash"), {
    recursive: true,
  });
  symlinkSync(
    path.join(root, "packages/auth"),
    path.join(root, "apps/web/node_modules/@pi-dash/auth"),
    "dir"
  );

  createStackSnapshot({ root, destination, files, worktreeId: "7" });

  expect(readFileSync(path.join(destination, ".env"), "utf8")).toBe(
    "LOCAL=one\n"
  );
  expect(readFileSync(path.join(destination, ".env.worktree"), "utf8")).toBe(
    "PORT=1234\n"
  );
  expect(readFileSync(path.join(destination, ".worktree-id"), "utf8")).toBe(
    "7"
  );
  expect(
    readFileSync(path.join(destination, "apps/web/src/index.ts"), "utf8")
  ).toBe("apps/web/src/index.ts");
  expect(
    lstatSync(path.join(destination, "apps/web/src/alias.ts")).isSymbolicLink()
  ).toBe(true);
  expect(readlinkSync(path.join(destination, "apps/web/src/alias.ts"))).toBe(
    "index.ts"
  );
  expect(
    realpathSync(path.join(destination, "node_modules/@pi-dash/auth"))
  ).toBe(realpathSync(path.join(destination, "packages/auth")));
  expect(
    realpathSync(path.join(destination, "apps/web/node_modules/@pi-dash/auth"))
  ).toBe(realpathSync(path.join(destination, "packages/auth")));
  expect(
    realpathSync(path.join(destination, "node_modules/external-package"))
  ).toBe(realpathSync(path.join(root, "node_modules/external-package")));
  writeFileSync(path.join(destination, "apps/web/src/index.ts"), "changed");
  expect(readFileSync(path.join(root, "apps/web/src/index.ts"), "utf8")).toBe(
    "apps/web/src/index.ts"
  );
});

test("keeps generated build caches separate between snapshots and the source", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "pi-dash-stack-caches-"));
  temporaryDirectories.push(temporary);
  const root = path.join(temporary, "source");
  const files = ["apps/web/package.json"];
  mkdirSync(path.join(root, "apps/web/node_modules"), { recursive: true });
  writeFileSync(
    path.join(root, files[0]),
    JSON.stringify({ name: "@pi-dash/web" })
  );
  for (const cache of [".nitro", ".vite", ".vite-temp", ".cache"]) {
    const source = path.join(root, "apps/web/node_modules", cache);
    mkdirSync(source);
    writeFileSync(path.join(source, "manifest.json"), "source");
  }
  for (const cache of [".nitro", ".vite", ".vite-temp", ".cache"]) {
    const source = path.join(root, "node_modules", cache);
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "manifest.json"), "source");
  }

  const first = path.join(temporary, "stack-1");
  const second = path.join(temporary, "stack-2");
  createStackSnapshot({ root, destination: first, files, worktreeId: "7" });
  createStackSnapshot({ root, destination: second, files, worktreeId: "7" });

  for (const cache of [".nitro", ".vite", ".vite-temp", ".cache"]) {
    for (const dir of ["node_modules", "apps/web/node_modules"]) {
      expect(existsSync(path.join(first, dir, cache))).toBe(false);
      expect(existsSync(path.join(second, dir, cache))).toBe(false);
      mkdirSync(path.join(first, dir, cache));
      writeFileSync(path.join(first, dir, cache, "manifest.json"), "first");
      expect(existsSync(path.join(second, dir, cache))).toBe(false);
      expect(
        readFileSync(path.join(root, dir, cache, "manifest.json"), "utf8")
      ).toBe("source");
    }
  }
});
