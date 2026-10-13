import { describe, expect, it } from "bun:test";

import { razorpaySetup } from "./config";

describe("razorpaySetup", () => {
  it("is off unless both the key id and the webhook secret are set", () => {
    expect(razorpaySetup({})).toEqual({ enabled: false });
    expect(razorpaySetup({ RAZORPAY_KEY_ID: "rzp_live_x" })).toEqual({
      enabled: false,
    });
    expect(razorpaySetup({ RAZORPAY_WEBHOOK_SECRET: "s" })).toEqual({
      enabled: false,
    });
    // A key secret alone does not turn it on.
    expect(
      razorpaySetup({
        RAZORPAY_KEY_SECRET: "k",
        RAZORPAY_WEBHOOK_SECRET: "s",
      })
    ).toEqual({ enabled: false });
  });

  it("takes the mode from the key id and uses the webhook copy without a key secret", () => {
    expect(
      razorpaySetup({
        RAZORPAY_KEY_ID: "rzp_test_x",
        RAZORPAY_WEBHOOK_SECRET: "s",
      })
    ).toEqual({
      apiKey: null,
      enabled: true,
      mode: "test",
      testInProduction: false,
      webhookSecret: "s",
    });
  });

  it("fetches from the API when the key secret is set", () => {
    const setup = razorpaySetup({
      RAZORPAY_KEY_ID: "rzp_live_x",
      RAZORPAY_KEY_SECRET: "k",
      RAZORPAY_WEBHOOK_SECRET: "s",
    });
    expect(setup).toMatchObject({
      apiKey: { id: "rzp_live_x", secret: "k" },
      mode: "live",
    });
  });

  it("flags a test key on a production server, and only there", () => {
    const values = {
      RAZORPAY_KEY_ID: "rzp_test_x",
      RAZORPAY_WEBHOOK_SECRET: "s",
    };
    expect(razorpaySetup({ ...values, NODE_ENV: "production" })).toMatchObject({
      testInProduction: true,
    });
    expect(
      razorpaySetup({
        ...values,
        NODE_ENV: "production",
        RAZORPAY_KEY_ID: "rzp_live_x",
      })
    ).toMatchObject({ testInProduction: false });
    expect(razorpaySetup({ ...values, NODE_ENV: "development" })).toMatchObject(
      { testInProduction: false }
    );
  });
});
