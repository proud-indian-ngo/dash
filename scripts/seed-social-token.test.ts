import { expect, it } from "bun:test";

import { shouldSeedDevSocialToken } from "./seed-social-token";

it("seeds the fixed dev social token everywhere except production", () => {
  expect(shouldSeedDevSocialToken("production")).toBe(false);
  expect(shouldSeedDevSocialToken("development")).toBe(true);
  expect(shouldSeedDevSocialToken("test")).toBe(true);
  expect(shouldSeedDevSocialToken(undefined)).toBe(true);
});
