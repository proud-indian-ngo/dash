/**
 * Grant periods and tranches run years ahead, so their date pickers reach
 * further than the usual current month.
 */
export const GRANT_LAST_MONTH = new Date(new Date().getFullYear() + 6, 11, 1);
