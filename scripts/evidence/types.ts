import type { Page } from "@playwright/test";

export type Role =
  | "super_admin"
  | "admin"
  | "finance_admin"
  | "volunteer"
  | "unoriented_volunteer"
  | "guest";
export type Viewport = "desktop" | "phone";

export interface Shot {
  /** Lowercase words and dashes; names the files and the evidence heading. */
  name: string;
  path: string;
  /** Who is signed in. Defaults to super_admin. */
  as?: Role;
  viewports?: Viewport[];
  /** False for a screen the PR adds, so the before side skips it. */
  before?: boolean;
  /**
   * Captures the whole page instead of the viewport. Fixed bars land mid-image
   * on phones, and a pair of different heights won't line up side by side.
   */
  fullPage?: boolean;
  /** Reaches the state to capture after the page loads: opens a sheet, fills a form. */
  prepare?: (page: Page) => Promise<void>;
}

export interface Capture {
  name: string;
  viewport: Viewport;
  file?: string;
  error?: string;
}
