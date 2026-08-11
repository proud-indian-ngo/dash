export const KALAKRITI_GENDER_ELIGIBILITY_LABELS = {
  both: "All Students",
  female: "Female Students",
  male: "Male Students",
} as const;

export type KalakritiGenderEligibility =
  keyof typeof KALAKRITI_GENDER_ELIGIBILITY_LABELS;
