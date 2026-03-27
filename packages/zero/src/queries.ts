import { defineQueries } from "@rocicorp/zero";
import { advancePaymentQueries } from "./queries/advance-payment";
import { appConfigQueries } from "./queries/app-config";
import { bankAccountQueries } from "./queries/bank-account";
import { eventInterestQueries } from "./queries/event-interest";
import {
  eventImmichAlbumQueries,
  eventPhotoQueries,
} from "./queries/event-photo";
import { eventUpdateQueries } from "./queries/event-update";
import { expenseCategoryQueries } from "./queries/expense-category";
import { notificationPreferenceQueries } from "./queries/notification-preference";
import { reimbursementQueries } from "./queries/reimbursement";
import { teamQueries } from "./queries/team";
import { teamEventQueries } from "./queries/team-event";
import { userQueries } from "./queries/user";
import { vendorQueries } from "./queries/vendor";
import { vendorPaymentQueries } from "./queries/vendor-payment";
import { vendorPaymentTransactionQueries } from "./queries/vendor-payment-transaction";
import { whatsappGroupQueries } from "./queries/whatsapp-group";

export const queries = defineQueries({
  user: userQueries,
  notificationPreference: notificationPreferenceQueries,
  bankAccount: bankAccountQueries,
  expenseCategory: expenseCategoryQueries,
  reimbursement: reimbursementQueries,
  advancePayment: advancePaymentQueries,
  appConfig: appConfigQueries,
  eventInterest: eventInterestQueries,
  eventUpdate: eventUpdateQueries,
  eventPhoto: eventPhotoQueries,
  eventImmichAlbum: eventImmichAlbumQueries,
  team: teamQueries,
  teamEvent: teamEventQueries,
  vendor: vendorQueries,
  vendorPayment: vendorPaymentQueries,
  vendorPaymentTransaction: vendorPaymentTransactionQueries,
  whatsappGroup: whatsappGroupQueries,
});
