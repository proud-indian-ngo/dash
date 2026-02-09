import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

const envPath = findUp(".env", process.cwd());
if (envPath) {
  expand(config({ path: envPath, quiet: true }));
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
