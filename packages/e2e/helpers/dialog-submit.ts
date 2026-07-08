import { expect, type Locator } from "@playwright/test";

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
  if (await dialog.isHidden({ timeout: 30_000 }).catch(() => false)) {
    return;
  }

  await dialog
    .page()
    .keyboard.press("Escape")
    .catch(() => {
      // The dialog may already be detached after the submit completes.
    });
  if (await dialog.isHidden({ timeout: 5000 }).catch(() => false)) {
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
