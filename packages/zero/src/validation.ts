import { isAfter, isValid, parseISO, startOfDay } from "date-fns";

export const isDateOnOrBeforeToday = (dateValue: string): boolean => {
  const parsedDate = parseISO(dateValue);
  if (!isValid(parsedDate)) {
    return false;
  }

  return !isAfter(startOfDay(parsedDate), startOfDay(new Date()));
};
