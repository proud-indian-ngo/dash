import { expect, type Locator } from "@playwright/test";

// `isHidden` ignores its timeout and checks once, so wait for the state instead.
function waitUntilHidden(dialog: Locator, timeout: number) {
  return dialog
    .waitFor({ state: "hidden", timeout })
    .then(() => true)
    .catch(() => false);
}

export async function clickUntilDialogCloses(
  dialog: Locator,
  buttonName: string | RegExp
) {
  const button = dialog.getByRole("button", {
    exact: typeof buttonName === "string",
    name: buttonName,
  });
  await expect(button).toBeEnabled({ timeout: 5000 });
  await dialog
    .locator("form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  if (await waitUntilHidden(dialog, 30_000)) {
    return;
  }

  await dialog
    .page()
    .keyboard.press("Escape")
    .catch(() => {
      // The dialog may already be detached after the submit completes.
    });
  if (await waitUntilHidden(dialog, 5000)) {
    return;
  }

  await dialog
    .getByRole("button", { name: "Close" })
    .click({ force: true, timeout: 5000 })
    .catch(() => {
      // Re-check below. The close button can detach as the dialog exits.
    });
  await expect(dialog).toBeHidden({ timeout: 5000 });
}
