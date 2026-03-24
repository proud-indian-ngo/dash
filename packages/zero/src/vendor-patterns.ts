/** IFSC: 4 alpha + "0" + 6 alphanumeric (e.g. SBIN0001234) */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

/** GST: 2 digits + 10 PAN chars + 1 alphanum + Z + 1 alphanum */
export const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/i;

/** PAN: 5 alpha + 4 digits + 1 alpha (e.g. ABCDE1234F) */
export const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/i;
