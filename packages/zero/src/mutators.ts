import { defineMutators } from "@rocicorp/zero";

import { advancePaymentMutators } from "./mutators/advance-payment";
import { appConfigMutators } from "./mutators/app-config";
import { bankAccountMutators } from "./mutators/bank-account";
import { budgetMutators } from "./mutators/budget";
import { eventFeedbackMutators } from "./mutators/event-feedback";
import { eventImmichAlbumMutators } from "./mutators/event-immich-album";
import { eventInterestMutators } from "./mutators/event-interest";
import { eventPhotoMutators } from "./mutators/event-photo";
import { eventUpdateMutators } from "./mutators/event-update";
import { expenseCategoryMutators } from "./mutators/expense-category";
import {
  accountHeadMutators,
  costCentreMutators,
  fundMutators,
  orgAccountMutators,
  programmeMutators,
  projectMutators,
} from "./mutators/finance-dimensions";
import {
  complianceItemMutators,
  complianceTemplateMutators,
  deedVersionMutators,
  governanceDocumentMutators,
  organisationRegistrationMutators,
  resolutionMutators,
  trusteeOfficeMutators,
  trusteeTermMutators,
} from "./mutators/governance";
import { contributionMutators, otherIncomeMutators } from "./mutators/income";
import { kalakritiAssignmentMutators } from "./mutators/kalakriti-assignment";
import { kalakritiAttendeeMutators } from "./mutators/kalakriti-attendee";
import { kalakritiAwardMutators } from "./mutators/kalakriti-award";
import { kalakritiCenterMutators } from "./mutators/kalakriti-center";
import { kalakritiCenterScanMutators } from "./mutators/kalakriti-center-scan";
import { kalakritiCompetitionMutators } from "./mutators/kalakriti-competition";
import { kalakritiEditionMutators } from "./mutators/kalakriti-edition";
import { kalakritiEligibilityMutators } from "./mutators/kalakriti-eligibility";
import { kalakritiEntryMutators } from "./mutators/kalakriti-entry";
import { kalakritiInventoryMutators } from "./mutators/kalakriti-inventory";
import { kalakritiOperationMutators } from "./mutators/kalakriti-operation";
import { kalakritiResultMutators } from "./mutators/kalakriti-result";
import { kalakritiStudentMutators } from "./mutators/kalakriti-student";
import { kalakritiTransportMutators } from "./mutators/kalakriti-transport";
import { notificationMutators } from "./mutators/notification";
import { notificationPreferenceMutators } from "./mutators/notification-preference";
import { reimbursementMutators } from "./mutators/reimbursement";
import { scheduledMessageMutators } from "./mutators/scheduled-message";
import { socialPostMutators } from "./mutators/social-post";
import { teamMutators } from "./mutators/team";
import { teamEventMutators } from "./mutators/team-event";
import { vendorMutators } from "./mutators/vendor";
import { vendorPaymentMutators } from "./mutators/vendor-payment";
import { vendorPaymentTransactionMutators } from "./mutators/vendor-payment-transaction";
import { whatsappGroupMutators } from "./mutators/whatsapp-group";

export const mutators = defineMutators({
  accountHead: accountHeadMutators,
  advancePayment: advancePaymentMutators,
  appConfig: appConfigMutators,
  bankAccount: bankAccountMutators,
  budget: budgetMutators,
  contribution: contributionMutators,
  complianceItem: complianceItemMutators,
  complianceTemplate: complianceTemplateMutators,
  costCentre: costCentreMutators,
  deedVersion: deedVersionMutators,
  eventFeedback: eventFeedbackMutators,
  eventImmichAlbum: eventImmichAlbumMutators,
  eventInterest: eventInterestMutators,
  eventPhoto: eventPhotoMutators,
  eventUpdate: eventUpdateMutators,
  expenseCategory: expenseCategoryMutators,
  fund: fundMutators,
  governanceDocument: governanceDocumentMutators,
  kalakritiAssignment: kalakritiAssignmentMutators,
  kalakritiAttendee: kalakritiAttendeeMutators,
  kalakritiAward: kalakritiAwardMutators,
  kalakritiCenter: kalakritiCenterMutators,
  kalakritiCenterScan: kalakritiCenterScanMutators,
  kalakritiCompetition: kalakritiCompetitionMutators,
  kalakritiEdition: kalakritiEditionMutators,
  kalakritiEligibility: kalakritiEligibilityMutators,
  kalakritiEntry: kalakritiEntryMutators,
  kalakritiInventory: kalakritiInventoryMutators,
  kalakritiOperation: kalakritiOperationMutators,
  kalakritiResult: kalakritiResultMutators,
  kalakritiStudent: kalakritiStudentMutators,
  kalakritiTransport: kalakritiTransportMutators,
  notification: notificationMutators,
  notificationPreference: notificationPreferenceMutators,
  orgAccount: orgAccountMutators,
  organisationRegistration: organisationRegistrationMutators,
  otherIncome: otherIncomeMutators,
  programme: programmeMutators,
  project: projectMutators,
  reimbursement: reimbursementMutators,
  resolution: resolutionMutators,
  scheduledMessage: scheduledMessageMutators,
  socialPost: socialPostMutators,
  team: teamMutators,
  teamEvent: teamEventMutators,
  trusteeOffice: trusteeOfficeMutators,
  trusteeTerm: trusteeTermMutators,
  vendor: vendorMutators,
  vendorPayment: vendorPaymentMutators,
  vendorPaymentTransaction: vendorPaymentTransactionMutators,
  whatsappGroup: whatsappGroupMutators,
});
