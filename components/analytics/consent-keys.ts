/**
 * The Google Consent Mode signals this site controls.
 *
 * Shared by the bootstrap script (server) and the live updater (client), so the
 * two can never disagree about which signals a click on Accept actually flips.
 *
 * `security_storage` is deliberately absent: it covers sign-in and fraud
 * prevention, which are the "essential cookies" the banner says we use either
 * way. Leaving it unset keeps it at Google's default of granted.
 */
export const CONSENT_KEYS = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "analytics_storage",
] as const;
