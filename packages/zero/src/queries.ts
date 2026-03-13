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
import { reimbursementQueries } from "./queries/reimbursement";
import { teamQueries } from "./queries/team";
import { teamEventQueries } from "./queries/team-event";
import { userQueries } from "./queries/user";
import { whatsappGroupQueries } from "./queries/whatsapp-group";

export const queries = defineQueries({
  user: userQueries,
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
  whatsappGroup: whatsappGroupQueries,
});
