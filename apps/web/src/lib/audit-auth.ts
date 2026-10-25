const AUDITED_AUTH_ACTIONS: Record<string, string> = {
  "/change-password": "account.password.change",
  // Allowing (or refusing) an assistant access to the account.
  "/oauth2/consent": "account.oauth.consent",
  "/sign-out": "account.sign_out",
  "/update-user": "account.profile.update",
};

const AUTH_CHANGED_FIELDS: Record<string, string[]> = {
  "/change-password": ["password"],
  "/oauth2/consent": ["oauthConsent"],
  "/sign-out": ["session"],
  "/update-user": ["profile"],
};

export function getAuditedAuthAction(path: string): string | undefined {
  return AUDITED_AUTH_ACTIONS[path];
}

export function getAuditedAuthChangedFields(path: string): string[] {
  return AUTH_CHANGED_FIELDS[path] ?? [];
}
