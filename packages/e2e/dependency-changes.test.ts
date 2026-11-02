import { describe, expect, test } from "bun:test";

import { dependencyChange } from "./dependency-changes";

const manifest = (fields: Record<string, unknown>) =>
  JSON.stringify({ name: "web", scripts: { build: "vite build" }, ...fields });

const lock = (
  packages: Record<string, unknown[]>,
  web: Record<string, string> = { "react-email": "^5.0.0" },
  rest: Record<string, unknown> = {}
) =>
  // bun.lock keeps trailing commas.
  `${JSON.stringify(
    {
      lockfileVersion: 1,
      ...rest,
      packages,
      workspaces: { "apps/web": { dependencies: web, name: "web" } },
    },
    null,
    2
  ).replace(/\n(\s*[}\]])/g, ",\n$1")}`;

describe("package.json", () => {
  test("names the dependencies it adds, bumps or removes", () => {
    expect(
      dependencyChange(
        "apps/web/package.json",
        manifest({
          dependencies: { a: "1", b: "1" },
          devDependencies: { c: "1" },
        }),
        manifest({
          dependencies: { a: "2", d: "1" },
          devDependencies: { c: "1" },
        })
      )
    ).toEqual({ names: ["a", "b", "d"] });
  });

  test("names a changed catalog entry", () => {
    expect(
      dependencyChange(
        "package.json",
        manifest({
          workspaces: { catalog: { zod: "4.1" }, packages: ["apps/*"] },
        }),
        manifest({
          workspaces: { catalog: { zod: "4.2" }, packages: ["apps/*"] },
        })
      )
    ).toEqual({ names: ["zod"] });
  });

  test("runs everything for a change outside the dependencies", () => {
    expect(
      dependencyChange(
        "package.json",
        manifest({ packageManager: "bun@1.4.3" }),
        manifest({ packageManager: "bun@1.4.4" })
      )
    ).toHaveProperty("all");
  });
});

describe("bun.lock", () => {
  const packages = (version: string) => ({
    "react-email": [
      "react-email@5.0.0",
      "",
      { dependencies: { "@react-email/render": "1" } },
      "sha",
    ],
    "@react-email/render": [`@react-email/render@${version}`, "", {}, "sha"],
  });

  test("traces a transitive bump to the direct dependency", () => {
    expect(
      dependencyChange(
        "bun.lock",
        lock(packages("1.0.0")),
        lock(packages("1.0.1"))
      )
    ).toEqual({ names: ["react-email"] });
  });

  test("names a workspace's changed dependency spec", () => {
    expect(
      dependencyChange(
        "bun.lock",
        lock(packages("1.0.0")),
        lock(packages("1.0.0"), { "react-email": "^5.1.0" })
      )
    ).toEqual({ names: ["react-email"] });
  });

  test("runs everything for a change to the lockfile's settings", () => {
    expect(
      dependencyChange(
        "bun.lock",
        lock(packages("1.0.0")),
        lock(packages("1.0.0"), undefined, { trustedDependencies: ["esbuild"] })
      )
    ).toHaveProperty("all");
  });
});

test("a new or unparsable dependency file runs everything", () => {
  expect(dependencyChange("bun.lock", undefined, "{}")).toHaveProperty("all");
  expect(dependencyChange("package.json", "{", "{}")).toHaveProperty("all");
});
