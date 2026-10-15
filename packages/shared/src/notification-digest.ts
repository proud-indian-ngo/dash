/** Same five tones as the app's `StatusBadge` and the email status badge. */
export type DigestStatusTone =
  | "danger"
  | "info"
  | "neutral"
  | "success"
  | "warning";

/**
 * How one notification reads as a row in a batched digest, set by its
 * sender and stored with the held message. The title and body are written
 * for a message about one record; a row puts the record first and keeps the
 * rest to one short line.
 */
export interface DigestRow {
  /** Link text for the row; "View" when absent. */
  actionLabel?: string;
  amountPaise?: number;
  /**
   * The page listing every record of this kind. The digest's button goes
   * there when all its rows share one; otherwise to the dashboard.
   */
  list?: { label: string; path: string };
  /** One short line under the name: who, why, how many. */
  meta?: string;
  /** The record the notification is about; what tells rows apart. */
  name: string;
  status?: { label: string; tone: DigestStatusTone };
}
