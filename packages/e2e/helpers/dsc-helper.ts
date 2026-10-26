import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page, Response } from "@playwright/test";

/**
 * Plays the DSC helper in E2E specs. run-e2e.sh and CI make a throwaway CA
 * (`signing/make-test-pki.sh`), which the E2E signing service trusts instead
 * of the CCA roots, and a key and certificate for each seeded trustee. A spec
 * catches the `keyseal://` link the page opens, then enrols or signs through
 * the KeySeal job endpoint as the helper would, with the trustee's test key.
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

const HELPER_LINK = /keyseal:\/\/(?:enrol|sign)\?job=([^"\\]+)/;

/** The helper version the specs speak as: the dashboard's minimum. */
const HELPER_VERSION = "0.1.0";

/**
 * Catches the next helper link the page receives from the server. Resolves
 * with the job token. The page opens the link in a hidden iframe, which the
 * test browser drops since no app handles `keyseal://`.
 */
export async function catchHelperLink(
  page: Page
): Promise<() => Promise<string>> {
  const token = Promise.withResolvers<string>();
  const onResponse = async (response: Response) => {
    if (!response.url().includes("/_serverFn/")) {
      return;
    }
    const match = HELPER_LINK.exec(await response.text().catch(() => ""));
    if (!match?.[1]) {
      return;
    }
    page.off("response", onResponse);
    const job = new URL(decodeURIComponent(match[1]));
    token.resolve(job.pathname.split("/").at(-1) ?? "");
  };
  page.on("response", onResponse);
  return () => token.promise;
}

/**
 * What the helper does with a job: claim it, send the certificate (which
 * completes an enrolment), and for a sign job sign what the service returns.
 */
export async function completeHelperJob(
  page: Page,
  token: string,
  signer: TestSigner
): Promise<{ message: string; status: number }> {
  const url = `/api/signing/v1/jobs/${token}`;
  const headers = { "X-KeySeal-Version": HELPER_VERSION };
  const claimed = await page.request.get(url, { headers });
  const job = (await claimed.json()) as {
    claimNonce?: string;
    kind?: "enrol" | "sign";
    message?: string;
  };
  if (!(claimed.ok() && job.claimNonce)) {
    return { message: job.message ?? "", status: claimed.status() };
  }
  const { claimNonce } = job;
  const prepared = await page.request.post(`${url}/certificate`, {
    data: { certificate: signer.certificate, chain: [], claimNonce },
    headers,
  });
  const reply = (await prepared.json()) as {
    documents?: { toSign: string }[];
    message?: string;
  };
  if (job.kind === "enrol" || !prepared.ok()) {
    return { message: reply.message ?? "", status: prepared.status() };
  }
  const key = createPrivateKey(signer.privateKey);
  const signed = await page.request.post(`${url}/signature`, {
    data: {
      claimNonce,
      // RSA PKCS#1 v1.5 over each document's signed attributes, as the
      // token signs.
      signatures: (reply.documents ?? []).map(({ toSign }) =>
        sign("sha256", Buffer.from(toSign, "base64"), key).toString("base64")
      ),
    },
    headers,
  });
  return {
    message: ((await signed.json()) as { message?: string }).message ?? "",
    status: signed.status(),
  };
}
