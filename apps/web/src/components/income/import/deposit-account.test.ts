import { describe, expect, it } from "bun:test";

import { FieldApi, FormApi } from "@tanstack/react-form";

import { applyDepositAccountDefault } from "./deposit-account";

const GIVE_DO = "give-do-clearing";
const BANK = "bank";

interface Values {
  orgAccountId?: string;
  source: "generic_csv" | "give_do_csv";
}

/**
 * The upload form's wiring around a real FormApi: `syncAccounts` is the
 * component's effect, and `update` is what `useForm` does on each render
 * with the defaults built from whatever accounts have synced.
 */
function uploadForm() {
  let giveDoAccountId: string | undefined;
  let userPicked = false;
  const defaults = (): Values => ({
    orgAccountId: giveDoAccountId,
    source: "give_do_csv",
  });
  const form = new FormApi({
    defaultValues: defaults(),
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        if (fieldApi.name === "source") {
          applyDepositAccountDefault(formApi, giveDoAccountId, userPicked);
        }
        if (fieldApi.name === "orgAccountId") {
          userPicked = true;
        }
      },
    },
  });
  form.mount();
  const source = new FieldApi({ form, name: "source" });
  const account = new FieldApi({ form, name: "orgAccountId" });
  source.mount();
  account.mount();
  return {
    account: () => form.getFieldValue("orgAccountId"),
    pick: (id: string) => account.handleChange(id),
    switchTo: (value: Values["source"]) => source.handleChange(value),
    syncAccounts: () => {
      giveDoAccountId = GIVE_DO;
      form.update({ ...form.options, defaultValues: defaults() });
      applyDepositAccountDefault(form, giveDoAccountId, userPicked);
    },
  };
}

describe("the give.do default for Deposited into", () => {
  it("fills the give.do account when accounts sync after the form opens", () => {
    const form = uploadForm();
    expect(form.account()).toBeUndefined();
    form.syncAccounts();
    expect(form.account()).toBe(GIVE_DO);
  });

  it("clears it on switching to Generic CSV after a late sync", () => {
    const form = uploadForm();
    form.syncAccounts();
    form.switchTo("generic_csv");
    expect(form.account()).toBeUndefined();
  });

  it("leaves Generic CSV empty when accounts sync after the switch", () => {
    const form = uploadForm();
    form.switchTo("generic_csv");
    form.syncAccounts();
    expect(form.account()).toBeUndefined();
  });

  it("fills it again on switching back to give.do", () => {
    const form = uploadForm();
    form.switchTo("generic_csv");
    form.syncAccounts();
    form.switchTo("give_do_csv");
    expect(form.account()).toBe(GIVE_DO);
  });

  it("keeps an account the user picked, whatever the source or sync", () => {
    const form = uploadForm();
    form.pick(BANK);
    form.syncAccounts();
    expect(form.account()).toBe(BANK);
    form.switchTo("generic_csv");
    expect(form.account()).toBe(BANK);
    form.switchTo("give_do_csv");
    expect(form.account()).toBe(BANK);
  });
});
