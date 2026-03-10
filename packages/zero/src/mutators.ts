import { defineMutators } from "@rocicorp/zero";
import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { expenseCategoryMutators } from "./mutators/expense-category";
import { reimbursementMutators } from "./mutators/reimbursement";
import { teamMutators } from "./mutators/team";
import { whatsappGroupMutators } from "./mutators/whatsapp-group";

export const mutators = defineMutators({
  bankAccount: bankAccountMutators,
  expenseCategory: expenseCategoryMutators,
  reimbursement: reimbursementMutators,
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  team: teamMutators,
  whatsappGroup: whatsappGroupMutators,
});
