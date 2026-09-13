import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type StackSnapshotOptions = {
  root: string;
  destination: string;
  files: string[];
  worktreeId: string;
};

const writableCaches = new Set([".nitro", ".vite", ".vite-temp", ".cache"]);

export function createStackSnapshot({
  root,
  destination,
  files,
  worktreeId,
}: StackSnapshotOptions): void {
  const workspaceDirs = files
    .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
    .map(path.dirname);
  const workspaces = new Map(
    workspaceDirs.map((dir) => [
      JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8"))
        .name as string,
      dir,
    ])
  );

  for (const file of files) {
    const target = path.join(destination, file);
    mkdirSync(path.dirname(target), { recursive: true });
    const source = path.join(root, file);
    if (lstatSync(source).isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target);
    } else {
      copyFileSync(source, target);
    }
  }
  for (const file of [".env", ".env.worktree"]) {
    if (existsSync(path.join(root, file)))
      copyFileSync(path.join(root, file), path.join(destination, file));
  }
  writeFileSync(path.join(destination, ".worktree-id"), worktreeId);

  // Installed packages can share links, but workspace packages and generated
  // build directories must resolve within this snapshot.
  for (const dir of ["", ...workspaceDirs]) {
    const source = path.join(root, dir, "node_modules");
    if (!existsSync(source)) continue;
    const target = path.join(destination, dir, "node_modules");
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      if (writableCaches.has(entry)) continue;
      if (entry === "@pi-dash") {
        mkdirSync(path.join(target, entry), { recursive: true });
        for (const name of readdirSync(path.join(source, entry))) {
          const workspace = workspaces.get(`${entry}/${name}`);
          if (!workspace)
            throw new Error(`Unknown workspace dependency: ${entry}/${name}`);
          symlinkSync(
            path.join(destination, workspace),
            path.join(target, entry, name),
            "dir"
          );
        }
      } else {
        symlinkSync(path.join(source, entry), path.join(target, entry), "dir");
      }
    }
  }
}
