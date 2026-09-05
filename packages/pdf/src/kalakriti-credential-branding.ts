export interface KalakritiCredentialBranding {
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  wordmark: string;
}

const DEFAULT_BRANDING: KalakritiCredentialBranding = {
  accentColor: "#7c2d12",
  backgroundColor: "#fff7ed",
  textColor: "#1c1917",
  wordmark: "Kalakriti",
};

const BRANDING_BY_KEY: Record<string, KalakritiCredentialBranding> = {
  "kalakriti-2027": {
    accentColor: "#9a3412",
    backgroundColor: "#fff7ed",
    textColor: "#1c1917",
    wordmark: "Kalakriti 2027",
  },
};

export function resolveKalakritiCredentialBranding(
  brandingKey: string
): KalakritiCredentialBranding {
  return BRANDING_BY_KEY[brandingKey] ?? DEFAULT_BRANDING;
}
