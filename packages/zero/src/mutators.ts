import { defineMutators } from "@rocicorp/zero";
import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { eventFeedbackMutators } from "./mutators/event-feedback";
import { eventImmichAlbumMutators } from "./mutators/event-immich-album";
import { eventInterestMutators } from "./mutators/event-interest";
import { eventPhotoMutators } from "./mutators/event-photo";
import { eventUpdateMutators } from "./mutators/event-update";
import { expenseCategoryMutators } from "./mutators/expense-category";
import { kalakritiAssignmentMutators } from "./mutators/kalakriti-assignment";
import { kalakritiCenterMutators } from "./mutators/kalakriti-center";
import { kalakritiCompetitionMutators } from "./mutators/kalakriti-competition";
import { kalakritiEditionMutators } from "./mutators/kalakriti-edition";
import { kalakritiEligibilityMutators } from "./mutators/kalakriti-eligibility";
import { kalakritiEntryMutators } from "./mutators/kalakriti-entry";
import { kalakritiStudentMutators } from "./mutators/kalakriti-student";
import { notificationMutators } from "./mutators/notification";
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
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  bankAccount: bankAccountMutators,
  eventFeedback: eventFeedbackMutators,
  eventImmichAlbum: eventImmichAlbumMutators,
  eventInterest: eventInterestMutators,
  eventPhoto: eventPhotoMutators,
  eventUpdate: eventUpdateMutators,
  expenseCategory: expenseCategoryMutators,
  kalakritiAssignment: kalakritiAssignmentMutators,
  kalakritiCenter: kalakritiCenterMutators,
  kalakritiCompetition: kalakritiCompetitionMutators,
  kalakritiEdition: kalakritiEditionMutators,
  kalakritiEligibility: kalakritiEligibilityMutators,
  kalakritiEntry: kalakritiEntryMutators,
  kalakritiStudent: kalakritiStudentMutators,
  notification: notificationMutators,
  notificationPreference: notificationPreferenceMutators,
  reimbursement: reimbursementMutators,
  scheduledMessage: scheduledMessageMutators,
  team: teamMutators,
  teamEvent: teamEventMutators,
  vendor: vendorMutators,
  vendorPayment: vendorPaymentMutators,
  vendorPaymentTransaction: vendorPaymentTransactionMutators,
  whatsappGroup: whatsappGroupMutators,
});
