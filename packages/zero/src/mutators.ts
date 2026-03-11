import { defineMutators } from "@rocicorp/zero";
import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { eventInterestMutators } from "./mutators/event-interest";
import { expenseCategoryMutators } from "./mutators/expense-category";
import { reimbursementMutators } from "./mutators/reimbursement";
import { teamMutators } from "./mutators/team";
import { teamEventMutators } from "./mutators/team-event";
import { whatsappGroupMutators } from "./mutators/whatsapp-group";

export const mutators = defineMutators({
  bankAccount: bankAccountMutators,
  expenseCategory: expenseCategoryMutators,
  reimbursement: reimbursementMutators,
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  eventInterest: eventInterestMutators,
  team: teamMutators,
  teamEvent: teamEventMutators,
  whatsappGroup: whatsappGroupMutators,
});
