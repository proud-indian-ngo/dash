import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

/**
 * Plays the DSC helper in E2E specs. run-e2e.sh and CI make a throwaway CA
 * (`signing/make-test-pki.sh`), which the E2E signing service trusts instead
 * of the CCA roots, and a key and certificate for each seeded trustee. A spec
 * catches the `pidash-sign://` link the page opens, then enrols or signs
 * through the job API as the helper would, with the trustee's test key.
 */

export interface TestSigner {
  certificate: string;
  privateKey: string;
}

/** A seeded trustee's test signer; throws when the run has no test CA. */
export function testSigner(slug: "asha-rao" | "vikram-menon"): TestSigner {
  const directory = process.env.E2E_SIGNING_PKI_DIR;
  if (!directory) {
    throw new Error(
      "E2E_SIGNING_PKI_DIR is not set: start the E2E signing service and its test CA (signing/make-test-pki.sh)"
    );
  }
  return JSON.parse(
    readFileSync(path.join(directory, "signers", `${slug}.json`), "utf8")
  ) as TestSigner;
}

const HELPER_LINK = /pidash-sign:\/\/(?:enrol|sign)\?job=([A-Za-z0-9_-]+)/;

/**
 * Catches the next helper link the page receives from the server, and
 * swaps it for an in-page anchor so the browser stays on the page. Resolves
 * with the job token.
 */
export async function catchHelperLink(
  page: Page
): Promise<() => Promise<string>> {
  const token = Promise.withResolvers<string>();
  const pattern = "**/_serverFn/**";
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const match = HELPER_LINK.exec(body);
    if (!match?.[1]) {
      await route.fulfill({ response });
      return;
    }
    token.resolve(match[1]);
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(
        ([name]) => name !== "content-length" && name !== "content-encoding"
      )
    );
    await route.fulfill({
      body: body.replace(/pidash-sign:\/\/[^"\\]+/, "#signing-helper"),
      headers,
      status: response.status(),
    });
    await page.unroute(pattern);
  });
  return () => token.promise;
}

/** What the helper does with a job: enrol the certificate, or sign. */
export async function completeHelperJob(
  page: Page,
  token: string,
  signer: TestSigner
): Promise<{ message: string; status: number }> {
  const url = `/api/signing/jobs/${token}`;
  const headers = { "X-Pidash-Sign-Version": "0.2.0" };
  const job = (await (await page.request.get(url, { headers })).json()) as {
    kind: "enrol" | "sign";
    toSign?: string;
  };
  const body =
    job.kind === "enrol"
      ? { certificates: [signer.certificate], chain: [] }
      : {
          certificate: signer.certificate,
          // RSA PKCS#1 v1.5 over the signed attributes, as the token signs.
          signature: sign(
            "sha256",
            Buffer.from(job.toSign ?? "", "base64"),
            createPrivateKey(signer.privateKey)
          ).toString("base64"),
        };
  const reply = await page.request.post(url, { data: body, headers });
  return {
    message: ((await reply.json()) as { message: string }).message,
    status: reply.status(),
  };
}
