/**
 * Fails when React Compiler skips a component or hook in apps/web/src. The
 * build skips silently, and code that leans on compiler memoization (effects
 * keyed on functions, values fed to the table hook) then re-runs every render.
 * Run by `bun run check`. Fixes for each bail-out are in
 * docs/architecture/monorepo.md#web-compilation.
 */
import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";

const SOURCE = new URL("../src/", import.meta.url).pathname;
const SKIPPED = new Set(["CompileError", "CompileSkip", "PipelineError"]);

interface CompilerEvent {
  detail?: { reason?: string; loc?: { start?: { line?: number } } };
  fnLoc?: { start?: { line?: number } };
  kind: string;
  reason?: string;
}

const failures: string[] = [];
const files = new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: SOURCE });
for await (const file of files) {
  if (file.includes(".test.") || file.endsWith(".gen.ts")) {
    continue;
  }
  await transformAsync(await Bun.file(SOURCE + file).text(), {
    babelrc: false,
    configFile: false,
    filename: SOURCE + file,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        reactCompiler,
        {
          logger: {
            logEvent: (_filename: string | null, event: CompilerEvent) => {
              if (!SKIPPED.has(event.kind)) {
                return;
              }
              const line =
                event.detail?.loc?.start?.line ?? event.fnLoc?.start?.line;
              const reason = event.detail?.reason ?? event.reason ?? event.kind;
              failures.push(`apps/web/src/${file}:${line}: ${reason}`);
            },
          },
        },
      ],
    ],
  });
}

if (failures.length > 0) {
  console.error(
    `React Compiler skipped ${failures.length} function(s):\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  "React Compiler compiles every component and hook in apps/web/src."
);
