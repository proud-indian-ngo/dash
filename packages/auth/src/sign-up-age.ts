import {
  isVolunteerAgeEligibleOnServer,
  MIN_DOB_YEAR,
  MIN_VOLUNTEER_AGE_MESSAGE,
} from "@pi-dash/shared/volunteer-age";

/** Why a self-registration `dob` is rejected, or `null` when it is allowed. */
export function signUpDobError(dob: unknown, now: Date): string | null {
  if (dob === undefined || dob === null || dob === "") {
    return "Date of birth is required";
  }
  const parsed =
    typeof dob === "string" || dob instanceof Date ? new Date(dob) : null;
  if (
    !parsed ||
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() < MIN_DOB_YEAR
  ) {
    return "Invalid date of birth";
  }
  if (!isVolunteerAgeEligibleOnServer(parsed, now)) {
    return MIN_VOLUNTEER_AGE_MESSAGE;
  }
  return null;
}
