import { randomInt } from "node:crypto";
import path from "node:path";

import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

// Production traffic reaches the app as Cloudflare -> Traefik -> app. Traefik
// trusts Cloudflare's ranges, so it keeps the X-Forwarded-For Cloudflare built
// (`<whatever the client sent>, <visitor>`) and appends the Cloudflare edge it
// heard from. These tests send that header shape straight to the app.
const EDGE = "172.70.1.20";
const EDGE_V6 = "2a06:98c0:3600::103";

/** A /64 no other spec or recent run uses, so its counters start empty. */
function freshNetwork(): string {
  return `2001:db8:${randomInt(0x1_00_00).toString(16)}:${randomInt(0x1_00_00).toString(16)}`;
}

const throughCloudflare = (...hops: string[]) => ({
  "x-forwarded-for": hops.join(", "),
});

/**
 * Sends requests in parallel batches until one is rate limited, so the test
 * holds whatever budget the server runs with. Returns the requests it took.
 */
async function exhaust(
  send: () => Promise<number>,
  batch: number,
  max: number
): Promise<number> {
  for (let sent = 0; sent < max; sent += batch) {
    const statuses = await Promise.all(Array.from({ length: batch }, send));
    if (statuses.includes(429)) {
      return sent + batch;
    }
  }
  throw new Error(`no 429 after ${max} requests`);
}

test.describe("Visitor identity behind Cloudflare", () => {
  test("give each visitor its own public feed budget and ignore forged hops", async ({
    request,
  }, testInfo) => {
    // Every feed request is cheap, but the E2E budget is 6,000 a minute.
    test.slow();
    const network = freshNetwork();
    const visitor = `${network}::7`;
    const neighbour = `${freshNetwork()}::7`;
    const feed = (headers: Record<string, string>) =>
      request
        .get("/api/public/events?days=3", { headers })
        .then((r) => r.status());

    const sent = await exhaust(
      () => feed(throughCloudflare(visitor, EDGE)),
      200,
      7000
    );
    const results = {
      sent,
      // Same edge, another /64: its own bucket.
      neighbour: await feed(throughCloudflare(neighbour, EDGE)),
      // Another address in the visitor's /64: the same bucket.
      sameNetwork: await feed(throughCloudflare(`${network}:1:2:3:4`, EDGE)),
      // The visitor reaching another edge, over IPv6: still the visitor.
      otherEdge: await feed(throughCloudflare(visitor, EDGE_V6)),
      // A client-supplied entry sits left of the one Cloudflare adds.
      forged: await feed(throughCloudflare("192.0.2.1", visitor, EDGE)),
    };
    await testInfo.attach("feed-statuses.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(results).toEqual({
      sent: expect.any(Number),
      neighbour: 200,
      sameNetwork: 429,
      otherEdge: 429,
      forged: 429,
    });
  });

  test("store the visitor, not a forged hop, on a new session", async ({
    request,
  }, testInfo) => {
    const visitor = `203.0.113.${randomInt(1, 255)}`;
    const signIn = await request.post("/api/auth/sign-in/email", {
      data: {
        email: process.env.VOLUNTEER_EMAIL,
        password: process.env.VOLUNTEER_PASSWORD,
      },
      headers: throughCloudflare("192.0.2.1", visitor, EDGE),
    });
    expect(signIn.status()).toBe(200);
    const session = await request.get("/api/auth/get-session");
    const { ipAddress } = (await session.json()).session;
    await testInfo.attach("session-ip.json", {
      body: JSON.stringify({ ipAddress, visitor }, null, 2),
      contentType: "application/json",
    });
    expect(ipAddress).toBe(visitor);
  });
});
