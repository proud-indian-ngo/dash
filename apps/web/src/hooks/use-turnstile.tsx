import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { env } from "@pi-dash/env/web";
import type { TurnstileAction } from "@pi-dash/shared/turnstile";
import { useRef } from "react";

/**
 * A Turnstile widget for one gated auth request. Tokens are single-use, so
 * `takeHeaders` hands the current token to one request and resets the widget
 * for the next attempt. Without a site key both are no-ops.
 */
export function useTurnstile(action: TurnstileAction) {
  const ref = useRef<TurnstileInstance>(null);
  // A ref, not state: form submit handlers may close over an older render.
  const token = useRef<string>(undefined);
  const siteKey = env.VITE_TURNSTILE_SITE_KEY;

  const widget = siteKey ? (
    <Turnstile
      onError={() => {
        token.current = undefined;
      }}
      onExpire={() => {
        token.current = undefined;
      }}
      onSuccess={(value) => {
        token.current = value;
      }}
      options={{ action, size: "flexible" }}
      ref={ref}
      siteKey={siteKey}
    />
  ) : null;

  const takeHeaders = (): Record<string, string> => {
    const value = token.current;
    if (!value) {
      return {};
    }
    token.current = undefined;
    ref.current?.reset();
    return { "x-captcha-response": value };
  };

  return { takeHeaders, widget };
}
