import { expect, test } from "@playwright/test";

/** The endpoints the KeySeal helper calls, which take no session. */
test.describe("KeySeal helper endpoints", () => {
  test("serve the manifest with the dashboard's name", async ({ request }) => {
    test.skip(
      Boolean(process.env.CI),
      "The manifest needs the signing service, which CI does not start"
    );
    const response = await request.get("/.well-known/keyseal.json");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Proud Indian",
      protocol: 1,
    });
  });

  test("answer an unknown job token with 404", async ({ request }) => {
    // The helper names its version; without one the endpoint answers 426.
    const response = await request.get(
      `/api/signing/v1/jobs/${"t".repeat(24)}`,
      { headers: { "X-KeySeal-Version": "0.1.0" } }
    );
    expect(response.status()).toBe(404);
  });
});
