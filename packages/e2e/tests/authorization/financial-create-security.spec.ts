// @e2e-areas reimbursements vendors
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

test("financial creation and payment races preserve persisted invariants", async ({
  baseURL: _baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Database invariants run once"
  );
  const { stdout } = await execFileAsync(
    "bun",
    [
      path.resolve(
        import.meta.dirname,
        "../../../zero/scripts/financial-security.ts"
      ),
    ],
    { env: process.env }
  );
  const result = JSON.parse(stdout.trim());
  expect(result.balance.total).toBe(10000);
  expect(result.vendorPaymentTransaction.fulfilled).toBe(1);
  await testInfo.attach("financial-concurrency.json", {
    body: stdout,
    contentType: "application/json",
  });
});
