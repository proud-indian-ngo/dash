import { defineMutators } from "@rocicorp/zero";
import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { centerMutators } from "./mutators/center";
import { classEventStudentMutators } from "./mutators/class-event-student";
import { eventFeedbackMutators } from "./mutators/event-feedback";
import { eventImmichAlbumMutators } from "./mutators/event-immich-album";
import { eventInterestMutators } from "./mutators/event-interest";
import { eventPhotoMutators } from "./mutators/event-photo";
import { eventUpdateMutators } from "./mutators/event-update";
import { expenseCategoryMutators } from "./mutators/expense-category";
import { notificationPreferenceMutators } from "./mutators/notification-preference";
import { reimbursementMutators } from "./mutators/reimbursement";
import { scheduledMessageMutators } from "./mutators/scheduled-message";
import { studentMutators } from "./mutators/student";
import { teamMutators } from "./mutators/team";
import { teamEventMutators } from "./mutators/team-event";
import { vendorMutators } from "./mutators/vendor";
import { vendorPaymentMutators } from "./mutators/vendor-payment";
import { vendorPaymentTransactionMutators } from "./mutators/vendor-payment-transaction";
import { whatsappGroupMutators } from "./mutators/whatsapp-group";

export const mutators = defineMutators({
  center: centerMutators,
  classEventStudent: classEventStudentMutators,
  notificationPreference: notificationPreferenceMutators,
  bankAccount: bankAccountMutators,
  expenseCategory: expenseCategoryMutators,
  reimbursement: reimbursementMutators,
  scheduledMessage: scheduledMessageMutators,
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  eventFeedback: eventFeedbackMutators,
  eventImmichAlbum: eventImmichAlbumMutators,
  eventInterest: eventInterestMutators,
  eventPhoto: eventPhotoMutators,
  eventUpdate: eventUpdateMutators,
  student: studentMutators,
  team: teamMutators,
  teamEvent: teamEventMutators,
  vendor: vendorMutators,
  vendorPayment: vendorPaymentMutators,
  vendorPaymentTransaction: vendorPaymentTransactionMutators,
  whatsappGroup: whatsappGroupMutators,
});
