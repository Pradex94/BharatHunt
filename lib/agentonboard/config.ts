/**
 * Returns the expected token audience for AgentOnboard.
 * In production this matches the canonical domain (e.g. bharathunt.org).
 * In development it defaults to localhost:3000, or can be overridden via AGENTONBOARD_AUDIENCE.
 */
export function getAgentAudience(): string {
  if (process.env.AGENTONBOARD_AUDIENCE) {
    return process.env.AGENTONBOARD_AUDIENCE.trim();
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_SITE_URL).host;
    } catch {
      // Ignore URL parse error and fall back
    }
  }
  return process.env.NODE_ENV === "production" ? "bharathunt.org" : "localhost:3000";
}
