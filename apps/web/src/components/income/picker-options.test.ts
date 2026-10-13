import { describe, expect, it } from "bun:test";

import { withCurrentOption } from "./picker-options";

const active = [
  { label: "HDFC current", value: "acc-1" },
  { label: "SBI savings", value: "acc-2" },
];

describe("withCurrentOption", () => {
  it("keeps the list as is when the current choice is offered", () => {
    expect(withCurrentOption(active, "acc-2", "SBI savings")).toEqual(active);
  });

  it("keeps the list as is when nothing is chosen", () => {
    expect(withCurrentOption(active, null, null)).toEqual(active);
    expect(withCurrentOption(active, undefined, "Old")).toEqual(active);
  });

  it("adds a retired choice, marked inactive", () => {
    expect(withCurrentOption(active, "acc-old", "Old ICICI")).toEqual([
      ...active,
      { label: "Old ICICI (inactive)", value: "acc-old" },
    ]);
  });

  it("names a choice whose record did not load as unknown", () => {
    expect(withCurrentOption([], "acc-gone", undefined)).toEqual([
      { label: "Unknown (inactive)", value: "acc-gone" },
    ]);
  });

  it("does not change the list it was given", () => {
    const options = [...active];
    withCurrentOption(options, "acc-old", "Old ICICI");
    expect(options).toEqual(active);
  });
});
