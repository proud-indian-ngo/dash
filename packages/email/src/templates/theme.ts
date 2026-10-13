/**
 * Product-language tokens from `@proudindian/design` (light theme), as hex
 * because email clients don't support CSS variables. Keep in step with
 * `packages/design-system/styles.css`.
 */
export const colors = {
  card: "#FFFFFF",
  field: "#F1F3F4",
  ink: "#0F1B24",
  line: "#E7EAED",
  muted: "#5B6670",
  page: "#F6F7F8",
  primary: "#08668C",
  primaryForeground: "#FFFFFF",
  subtle: "#8A949C",
  wash: "#E9F5FA",
} as const;

export type StatusTone = "danger" | "info" | "neutral" | "success" | "warning";

/** Same five tones as the app's `StatusBadge`: soft tint, dot and word. */
export const statusTones: Record<
  StatusTone,
  { background: string; dot: string; text: string }
> = {
  danger: { background: "#FBEAE9", dot: "#B3261E", text: "#B3261E" },
  info: { background: "#E9F5FA", dot: "#0B7FAE", text: "#08668C" },
  neutral: { background: "#F1F3F4", dot: "#8A949C", text: "#5B6670" },
  success: { background: "#EAF5EE", dot: "#3FA866", text: "#1F6B3A" },
  warning: { background: "#FDF5E3", dot: "#E0A526", text: "#8A5A00" },
};

/** Gmail ignores web fonts, so every stack ends in the system sans or mono. */
export const fonts = {
  display:
    '"Bricolage Grotesque", Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: '"Paper Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  sans: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
} as const;

export const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600&family=Geist:wght@400;500;600&display=swap');";

export const DEFAULT_APP_NAME = "Proud Indian Dashboard";
export const DEFAULT_APP_URL = "https://dash.proudindian.ngo";
