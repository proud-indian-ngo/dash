import type { Download, Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const ENDPOINT = `/api/kalakriti/${YEAR}/id-cards`;
const BLANK_ENDPOINT = `${ENDPOINT}?mode=blank&volunteerPages=1&guestPages=1&judgePages=1`;

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function openIdCardTools(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "ID cards and registration tools" })
    .click();
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
  await openIdCardTools(page);
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
    await openIdCardTools(editionAdminPage);
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
      nonAdminPage.getByRole("button", {
        name: "ID cards and registration tools",
      })
    ).toHaveCount(0);
    await expect(
      nonAdminPage.getByRole("button", { name: "Register ID card" })
    ).toHaveCount(0);
    expect((await nonAdmin.request.get(ENDPOINT)).status()).toBe(403);
    expect((await anonymous.request.get(ENDPOINT)).status()).toBe(401);
  } finally {
    await editionAdmin.close();
    await nonAdmin.close();
    await anonymous.close();
  }
});

test("downloads requested blank ID-card pages only for Kalakriti administrators", async ({
  baseURL,
  browser,
  kalakritiActors,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "admin",
    "Kalakriti blank ID-card download authorization"
  );

  await page.goto(`/kalakriti/${YEAR}`);
  await waitForZeroReady(page);
  await openIdCardTools(page);
  await page.getByRole("button", { name: "Download blank ID cards" }).click();
  const dialog = page.getByRole("dialog", { name: "Blank ID cards" });
  await expect(dialog).toBeVisible();
  for (const label of ["Volunteer pages", "Guest pages", "Judge pages"]) {
    await expect(dialog.getByLabel(label)).toHaveValue("0");
  }
  await dialog.getByRole("button", { name: "Download PDF" }).click();
  await expect(dialog).toContainText("Choose between 1 and 100 pages");
  for (const label of ["Volunteer pages", "Guest pages", "Judge pages"]) {
    await dialog.getByLabel(label).fill("1");
  }
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `kalakriti-${YEAR}-blank-id-cards.pdf`
  );
  const pdf = await readDownload(download);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.toString().match(/\/MediaBox\s*\[[^\]]+\]/g)).toHaveLength(3);
  await testInfo.attach("blank-id-cards.pdf", {
    body: pdf,
    contentType: "application/pdf",
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
    const nonAdminPage = await nonAdmin.newPage();
    await nonAdminPage.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(nonAdminPage);
    await expect(
      nonAdminPage.getByRole("button", {
        name: "ID cards and registration tools",
      })
    ).toHaveCount(0);
    await expect(
      nonAdminPage.getByRole("button", { name: "Register ID card" })
    ).toHaveCount(0);
    expect((await nonAdmin.request.get(BLANK_ENDPOINT)).status()).toBe(403);
    expect((await anonymous.request.get(BLANK_ENDPOINT)).status()).toBe(401);
  } finally {
    await nonAdmin.close();
    await anonymous.close();
  }
});

test("registers a blank guest card once and resolves it through person lookup", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "admin",
    "Kalakriti blank guest-card registration"
  );
  test.slow();

  const cardId = uuidv7();
  const name = `Printed Card Guest ${cardId.slice(-8)}`;
  const qrValue = JSON.stringify({ id: cardId, type: "guest" });

  await page.goto(`/kalakriti/${YEAR}`);
  await waitForZeroReady(page);
  await page.getByRole("button", { name: "Register ID card" }).click();
  const registerDialog = page.getByRole("dialog", {
    name: "Register ID card",
  });
  await registerDialog.getByLabel("QR code value").fill(qrValue);
  await registerDialog.getByRole("button", { name: "Register card" }).click();

  const guestDialog = page.getByRole("dialog", { name: "Add Guest" });
  await expect(guestDialog).toBeVisible();
  await guestDialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(name);
  await guestDialog
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("+919876543210");
  await guestDialog.getByRole("button", { name: "Create Guest" }).click();
  await expect(guestDialog).toBeHidden();

  const lookup = await page.request.get(
    `/api/kalakriti/${YEAR}/people/lookup?humanId=${cardId}`
  );
  expect(lookup.ok()).toBe(true);
  expect(await lookup.json()).toMatchObject({
    kind: "guest",
    name,
  });

  await page.getByRole("button", { name: "Register ID card" }).click();
  const duplicateDialog = page.getByRole("dialog", {
    name: "Register ID card",
  });
  await duplicateDialog.getByLabel("QR code value").fill(qrValue);
  await duplicateDialog.getByRole("button", { name: "Register card" }).click();
  await expect(duplicateDialog).toContainText("already registered");
});

test("registers a blank judge card and resolves it through person lookup", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "admin",
    "Kalakriti blank judge-card registration"
  );

  const cardId = uuidv7();
  const name = `Printed Card Judge ${cardId.slice(-8)}`;
  const qrValue = JSON.stringify({ id: cardId, type: "judge" });

  await page.goto(`/kalakriti/${YEAR}`);
  await waitForZeroReady(page);
  await page.getByRole("button", { name: "Register ID card" }).click();
  const registerDialog = page.getByRole("dialog", {
    name: "Register ID card",
  });
  await registerDialog.getByLabel("QR code value").fill(qrValue);
  await registerDialog.getByRole("button", { name: "Register card" }).click();

  const judgeDialog = page.getByRole("dialog", { name: "Add Judge" });
  await expect(judgeDialog).toBeVisible();
  await judgeDialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(name);
  await judgeDialog
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("+919876543211");
  await judgeDialog.getByRole("button", { name: "Create Judge" }).click();
  await expect(judgeDialog).toBeHidden();

  const lookup = await page.request.get(
    `/api/kalakriti/${YEAR}/people/lookup?humanId=${cardId}`
  );
  expect(lookup.ok()).toBe(true);
  expect(await lookup.json()).toMatchObject({
    kind: "judge",
    name,
  });
});

test("creates and registers a volunteer from a blank card", async ({
  browser,
  baseURL,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "admin",
    "Kalakriti blank volunteer-card registration"
  );
  test.slow();

  const context = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.editionAdmin.storageState,
  });
  const page = await context.newPage();
  try {
    const cardId = uuidv7();
    const suffix = cardId.slice(-8);
    const name = `Printed Card Volunteer ${suffix}`;
    const qrValue = JSON.stringify({ id: cardId, type: "volunteer" });

    await page.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Register ID card" }).click();
    const registerDialog = page.getByRole("dialog", {
      name: "Register ID card",
    });
    await registerDialog.getByLabel("QR code value").fill(qrValue);
    await registerDialog.getByRole("button", { name: "Register card" }).click();

    const volunteerDialog = page.getByRole("dialog", {
      name: "Register volunteer card",
    });
    await expect(volunteerDialog).toBeVisible();
    await volunteerDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(name);
    await expect(
      volunteerDialog.getByRole("textbox", { name: "Email" })
    ).toBeVisible();
    await expect(
      volunteerDialog.getByRole("textbox", { name: "Phone" })
    ).toBeVisible();
    await volunteerDialog
      .getByRole("button", { name: "Register volunteer" })
      .click();
    await expect(volunteerDialog).toBeHidden();

    const lookup = await page.request.get(
      `/api/kalakriti/${YEAR}/people/lookup?humanId=${cardId}`
    );
    expect(lookup.ok()).toBe(true);
    expect(await lookup.json()).toMatchObject({
      kind: "volunteer",
      name,
    });
  } finally {
    await context.close();
  }
});
