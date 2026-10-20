import { defineQueries } from "@rocicorp/zero";

import { advancePaymentQueries } from "./queries/advance-payment";
import { appConfigQueries } from "./queries/app-config";
import { bankAccountQueries } from "./queries/bank-account";
import { budgetQueries } from "./queries/budget";
import { eventFeedbackQueries } from "./queries/event-feedback";
import { eventInterestQueries } from "./queries/event-interest";
import {
  eventImmichAlbumQueries,
  eventPhotoQueries,
} from "./queries/event-photo";
import { eventUpdateQueries } from "./queries/event-update";
import { expenseCategoryQueries } from "./queries/expense-category";
import {
  accountHeadQueries,
  costCentreQueries,
  fiscalYearQueries,
  fundQueries,
  orgAccountQueries,
  programmeQueries,
  projectQueries,
} from "./queries/finance-dimensions";
import { gatewaySettlementQueries } from "./queries/gateway-settlement";
import {
  circularQueries,
  complianceQueries,
  conflictDeclarationQueries,
  deedVersionQueries,
  governanceDocumentQueries,
  meetingQueries,
  organisationRegistrationQueries,
  policyQueries,
  resolutionQueries,
  trusteeQueries,
} from "./queries/governance";
import {
  contributionQueries,
  contributionReceiptQueries,
  importBatchQueries,
  otherIncomeQueries,
} from "./queries/income";
import { kalakritiAssignmentQueries } from "./queries/kalakriti-assignment";
import { kalakritiAttendeeQueries } from "./queries/kalakriti-attendee";
import { kalakritiCenterQueries } from "./queries/kalakriti-center";
import { kalakritiCenterScanQueries } from "./queries/kalakriti-center-scan";
import { kalakritiCompetitionQueries } from "./queries/kalakriti-competition";
import { kalakritiEditionQueries } from "./queries/kalakriti-edition";
import { kalakritiEligibilityQueries } from "./queries/kalakriti-eligibility";
import { kalakritiEntryQueries } from "./queries/kalakriti-entry";
import { kalakritiFoodQueries } from "./queries/kalakriti-food";
import { kalakritiGuardianQueries } from "./queries/kalakriti-guardian";
import { kalakritiInventoryQueries } from "./queries/kalakriti-inventory";
import { kalakritiStudentQueries } from "./queries/kalakriti-student";
import { kalakritiTransportQueries } from "./queries/kalakriti-transport";
import { ledgerQueries } from "./queries/ledger";
import { notificationQueries } from "./queries/notification";
import { notificationPreferenceQueries } from "./queries/notification-preference";
import { partyQueries } from "./queries/party";
import { reimbursementQueries } from "./queries/reimbursement";
import { scheduledMessageQueries } from "./queries/scheduled-message";
import { socialPostQueries, socialRunQueries } from "./queries/social";
import { statementLineQueries } from "./queries/statement-line";
import { teamQueries } from "./queries/team";
import { teamEventQueries } from "./queries/team-event";
import { userQueries } from "./queries/user";
import { vendorQueries } from "./queries/vendor";
import { vendorPaymentQueries } from "./queries/vendor-payment";
import { vendorPaymentTransactionQueries } from "./queries/vendor-payment-transaction";
import { whatsappGroupQueries } from "./queries/whatsapp-group";

export const queries = defineQueries({
  accountHead: accountHeadQueries,
  advancePayment: advancePaymentQueries,
  appConfig: appConfigQueries,
  bankAccount: bankAccountQueries,
  budget: budgetQueries,
  contribution: contributionQueries,
  contributionReceipt: contributionReceiptQueries,
  circular: circularQueries,
  compliance: complianceQueries,
  conflictDeclaration: conflictDeclarationQueries,
  costCentre: costCentreQueries,
  deedVersion: deedVersionQueries,
  eventFeedback: eventFeedbackQueries,
  eventImmichAlbum: eventImmichAlbumQueries,
  eventInterest: eventInterestQueries,
  eventPhoto: eventPhotoQueries,
  eventUpdate: eventUpdateQueries,
  expenseCategory: expenseCategoryQueries,
  fiscalYear: fiscalYearQueries,
  fund: fundQueries,
  gatewaySettlement: gatewaySettlementQueries,
  governanceDocument: governanceDocumentQueries,
  importBatch: importBatchQueries,
  kalakritiAssignment: kalakritiAssignmentQueries,
  kalakritiAttendee: kalakritiAttendeeQueries,
  kalakritiCenter: kalakritiCenterQueries,
  kalakritiCenterScan: kalakritiCenterScanQueries,
  kalakritiCompetition: kalakritiCompetitionQueries,
  kalakritiEdition: kalakritiEditionQueries,
  kalakritiEligibility: kalakritiEligibilityQueries,
  kalakritiEntry: kalakritiEntryQueries,
  kalakritiFood: kalakritiFoodQueries,
  kalakritiGuardian: kalakritiGuardianQueries,
  kalakritiInventory: kalakritiInventoryQueries,
  kalakritiStudent: kalakritiStudentQueries,
  kalakritiTransport: kalakritiTransportQueries,
  ledger: ledgerQueries,
  meeting: meetingQueries,
  notification: notificationQueries,
  notificationPreference: notificationPreferenceQueries,
  orgAccount: orgAccountQueries,
  organisationRegistration: organisationRegistrationQueries,
  otherIncome: otherIncomeQueries,
  party: partyQueries,
  policy: policyQueries,
  programme: programmeQueries,
  project: projectQueries,
  reimbursement: reimbursementQueries,
  resolution: resolutionQueries,
  scheduledMessage: scheduledMessageQueries,
  socialPost: socialPostQueries,
  socialRun: socialRunQueries,
  statementLine: statementLineQueries,
  team: teamQueries,
  teamEvent: teamEventQueries,
  trustee: trusteeQueries,
  user: userQueries,
  vendor: vendorQueries,
  vendorPayment: vendorPaymentQueries,
  vendorPaymentTransaction: vendorPaymentTransactionQueries,
  whatsappGroup: whatsappGroupQueries,
});
