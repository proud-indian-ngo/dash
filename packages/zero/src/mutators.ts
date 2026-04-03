import { defineMutators } from "@rocicorp/zero";
import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { eventFeedbackMutators } from "./mutators/event-feedback";
import { eventInterestMutators } from "./mutators/event-interest";
import { eventPhotoMutators } from "./mutators/event-photo";
import { eventUpdateMutators } from "./mutators/event-update";
import { expenseCategoryMutators } from "./mutators/expense-category";
import { notificationPreferenceMutators } from "./mutators/notification-preference";
import { reimbursementMutators } from "./mutators/reimbursement";
import { scheduledMessageMutators } from "./mutators/scheduled-message";
import { teamMutators } from "./mutators/team";
import { teamEventMutators } from "./mutators/team-event";
import { vendorMutators } from "./mutators/vendor";
import { vendorPaymentMutators } from "./mutators/vendor-payment";
import { vendorPaymentTransactionMutators } from "./mutators/vendor-payment-transaction";
import { whatsappGroupMutators } from "./mutators/whatsapp-group";

export const mutators = defineMutators({
  notificationPreference: notificationPreferenceMutators,
  bankAccount: bankAccountMutators,
  expenseCategory: expenseCategoryMutators,
  reimbursement: reimbursementMutators,
  scheduledMessage: scheduledMessageMutators,
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  eventFeedback: eventFeedbackMutators,
  eventInterest: eventInterestMutators,
  eventPhoto: eventPhotoMutators,
  eventUpdate: eventUpdateMutators,
  team: teamMutators,
  teamEvent: teamEventMutators,
  vendor: vendorMutators,
  vendorPayment: vendorPaymentMutators,
  vendorPaymentTransaction: vendorPaymentTransactionMutators,
  whatsappGroup: whatsappGroupMutators,
});
