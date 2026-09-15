import type { Download } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const ENDPOINT = `/api/kalakriti/${YEAR}/id-cards`;

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

test("downloads all-person ID cards only for Kalakriti administrators", async ({
  baseURL,
  browser,
  kalakritiActors,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "admin",
    "Kalakriti ID-card download authorization"
  );
  test.slow();

  await page.goto(`/kalakriti/${YEAR}`);
  await waitForZeroReady(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ID cards" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`kalakriti-${YEAR}-id-cards.pdf`);
  const pdf = await readDownload(download);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await testInfo.attach("id-cards.pdf", {
    body: pdf,
    contentType: "application/pdf",
  });

  const editionAdmin = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.editionAdmin.storageState,
  });
  const nonAdmin = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.overallEventsLead.storageState,
  });
  const anonymous = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const editionAdminPage = await editionAdmin.newPage();
    await editionAdminPage.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(editionAdminPage);
    await expect(
      editionAdminPage.getByRole("button", { name: "Download ID cards" })
    ).toBeVisible();

    const response = await editionAdmin.request.get(ENDPOINT);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const nonAdminPage = await nonAdmin.newPage();
    await nonAdminPage.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(nonAdminPage);
    await expect(
      nonAdminPage.getByRole("button", { name: "Download ID cards" })
    ).toHaveCount(0);
    expect((await nonAdmin.request.get(ENDPOINT)).status()).toBe(403);
    expect((await anonymous.request.get(ENDPOINT)).status()).toBe(401);
  } finally {
    await editionAdmin.close();
    await nonAdmin.close();
    await anonymous.close();
  }
});
