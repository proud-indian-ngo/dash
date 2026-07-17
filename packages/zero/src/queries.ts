import { defineQueries } from "@rocicorp/zero";
import { advancePaymentQueries } from "./queries/advance-payment";
import { appConfigQueries } from "./queries/app-config";
import { bankAccountQueries } from "./queries/bank-account";
import { eventFeedbackQueries } from "./queries/event-feedback";
import { eventInterestQueries } from "./queries/event-interest";
import {
  eventImmichAlbumQueries,
  eventPhotoQueries,
} from "./queries/event-photo";
import { eventUpdateQueries } from "./queries/event-update";
import { expenseCategoryQueries } from "./queries/expense-category";
import { kalakritiAssignmentQueries } from "./queries/kalakriti-assignment";
import { kalakritiCenterQueries } from "./queries/kalakriti-center";
import { kalakritiEditionQueries } from "./queries/kalakriti-edition";
import { kalakritiEligibilityQueries } from "./queries/kalakriti-eligibility";
import { kalakritiGuardianQueries } from "./queries/kalakriti-guardian";
import { notificationQueries } from "./queries/notification";
import { notificationPreferenceQueries } from "./queries/notification-preference";
import { reimbursementQueries } from "./queries/reimbursement";
import { scheduledMessageQueries } from "./queries/scheduled-message";
import { teamQueries } from "./queries/team";
import { teamEventQueries } from "./queries/team-event";
import { userQueries } from "./queries/user";
import { vendorQueries } from "./queries/vendor";
import { vendorPaymentQueries } from "./queries/vendor-payment";
import { vendorPaymentTransactionQueries } from "./queries/vendor-payment-transaction";
import { whatsappGroupQueries } from "./queries/whatsapp-group";

export const queries = defineQueries({
  advancePayment: advancePaymentQueries,
  appConfig: appConfigQueries,
  bankAccount: bankAccountQueries,
  eventFeedback: eventFeedbackQueries,
  eventImmichAlbum: eventImmichAlbumQueries,
  eventInterest: eventInterestQueries,
  eventPhoto: eventPhotoQueries,
  eventUpdate: eventUpdateQueries,
  expenseCategory: expenseCategoryQueries,
  kalakritiAssignment: kalakritiAssignmentQueries,
  kalakritiCenter: kalakritiCenterQueries,
  kalakritiEdition: kalakritiEditionQueries,
  kalakritiEligibility: kalakritiEligibilityQueries,
  kalakritiGuardian: kalakritiGuardianQueries,
  notification: notificationQueries,
  notificationPreference: notificationPreferenceQueries,
  reimbursement: reimbursementQueries,
  scheduledMessage: scheduledMessageQueries,
  team: teamQueries,
  teamEvent: teamEventQueries,
  user: userQueries,
  vendor: vendorQueries,
  vendorPayment: vendorPaymentQueries,
  vendorPaymentTransaction: vendorPaymentTransactionQueries,
  whatsappGroup: whatsappGroupQueries,
});
