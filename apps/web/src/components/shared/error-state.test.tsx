import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ErrorState } from "./error-state";

const CHUNK_ERROR = new TypeError(
  "Failed to fetch dynamically imported module: https://dash.example.org/assets/_app-a1.js"
);

describe("ErrorState", () => {
  it("offers a reload, not a bug report, when a chunk failed to load", () => {
    const html = renderToStaticMarkup(
      <ErrorState actions={null} error={CHUNK_ERROR} />
    );
    expect(html).toContain("A new version is available");
    expect(html).toContain("hard refresh");
    expect(html).not.toContain("Reference");
  });

  it("shows the reference for other errors", () => {
    const html = renderToStaticMarkup(
      <ErrorState actions={null} error={new Error("boom")} />
    );
    expect(html).toContain("This page couldn&#x27;t load");
    expect(html).toContain("Reference");
  });
});
