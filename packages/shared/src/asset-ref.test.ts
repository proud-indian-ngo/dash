import { describe, expect, it } from "vitest";
import { isAssetId, isTemporaryR2Key } from "./asset-ref";

describe("asset reference validation", () => {
  it("accepts UUID asset IDs and rejects malformed IDs", () => {
    expect(isAssetId("e2e00000-0000-0000-0000-000000000005")).toBe(true);
    expect(isAssetId("not-a-uuid")).toBe(false);
  });

  it("detects temporary path segments only", () => {
    expect(isTemporaryR2Key("app/attachments/tmp/user/file.pdf")).toBe(true);
    expect(isTemporaryR2Key("tmp/user/file.pdf")).toBe(true);
    expect(isTemporaryR2Key("app/attachments/tmp-file.pdf")).toBe(false);
  });
});
