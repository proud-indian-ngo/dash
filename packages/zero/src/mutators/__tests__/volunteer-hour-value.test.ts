import { describe, expect, it } from "bun:test";

import {
  assertCanWriteAppConfig,
  assertValidAppConfigValue,
} from "../app-config";

const KEY = "volunteer_hour_value_paise";

describe("volunteer hour value setting", () => {
  it("lets finance.manage write it and refuses finance.view", () => {
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["finance.manage"], userId: "u" } as never,
        KEY
      )
    ).not.toThrow();
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["finance.view"], userId: "u" } as never,
        KEY
      )
    ).toThrow("Unauthorized");
  });

  it.each(["0", "-100", "12.5", "abc", "10000001"])(
    "refuses %s paise",
    (value) => {
      expect(() => assertValidAppConfigValue(KEY, value)).toThrow(
        "Enter an hourly value between ₹0.01 and ₹1,00,000"
      );
    }
  );

  it("accepts ₹250 an hour", () => {
    expect(() => assertValidAppConfigValue(KEY, "25000")).not.toThrow();
  });
});
