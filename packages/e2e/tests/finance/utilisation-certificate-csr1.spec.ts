import { expect, test } from "../../fixtures/test";
import {
  fixture,
  newGrant,
  openGrant,
  openPrepare,
} from "../../helpers/utilisation-certificate-steps";

/**
 * A CSR grant's certificate prints the trust's CSR-1 registration, so it
 * can't be prepared without one; a specific grant's can. Hiding the
 * registration affects every certificate, so this spec runs in the
 * `exclusive_last` project, alone, and puts the registration back.
 */

const CSR1_PROBLEM =
  "A CSR grant's certificate prints the trust's CSR-1 registration number. Add it under Governance → Registrations first.";

test.describe("utilisation certificates without CSR-1 (runs last, alone)", () => {
  test("a CSR grant needs the trust's CSR-1 registration; a specific grant doesn't", async ({
    page,
  }) => {
    // Made first: making a grant adds a CSR-1 registration when there is none.
    const csr = await newGrant("csr");
    const specific = await newGrant("specific_grant");
    const hidden = await fixture<unknown[]>("hide-csr1");
    try {
      await openGrant(page, csr.grantId);
      const blocked = await openPrepare(page);
      await expect(
        blocked.getByTestId("certificate-preview").getByRole("alert")
      ).toContainText(CSR1_PROBLEM, { timeout: 20_000 });
      await expect(
        blocked.getByRole("button", {
          exact: true,
          name: "Prepare certificate",
        })
      ).toBeDisabled();

      await openGrant(page, specific.grantId);
      const allowed = await openPrepare(page);
      const preview = allowed.getByTestId("certificate-preview");
      await expect(preview).toContainText("Closing unspent₹3,000.00", {
        timeout: 20_000,
      });
      await expect(preview.getByRole("alert")).toHaveCount(0);
      await expect(
        allowed.getByRole("button", {
          exact: true,
          name: "Prepare certificate",
        })
      ).toBeEnabled();
    } finally {
      await fixture("restore-csr1", JSON.stringify(hidden));
    }
  });
});
