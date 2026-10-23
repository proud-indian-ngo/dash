/** Turnstile action per gated Better Auth endpoint; siteverify rejects a token minted for another one. */
export const TURNSTILE_ACTIONS = {
  "/request-password-reset": "password-reset",
  "/sign-in/email": "login",
  "/sign-up/email": "signup",
} as const;

export type TurnstileAction =
  (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
