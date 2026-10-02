/**
 * robots.txt, per RFC 9309, for the handful of pages the agent reads per site.
 *
 * The rules that matter:
 *   - the group for our product token wins over `*`; groups are matched on the
 *     token, case-insensitively;
 *   - the longest matching path wins, and on a tie Allow beats Disallow;
 *   - `*` matches any run of characters and a trailing `$` anchors the end;
 *   - a 4xx robots.txt means "no rules" (allowed), but an unreachable one (5xx
 *     or a network failure) means "assume complete disallow" — so a site that
 *     is down is never crawled on the theory that it did not object.
 *
 * Pure, so `tests/` can cover it.
 */

/** Our product token, matched against `User-agent:` lines. */
export const ROBOTS_TOKEN = "bharathuntbot";

export type RobotsRules = { allow: string[]; disallow: string[] };

/** Everything allowed — a 4xx robots.txt, or one with no group for us. */
export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [] };
/** Nothing allowed — an unreachable robots.txt. */
export const DISALLOW_ALL: RobotsRules = { allow: [], disallow: ["/"] };

type Group = { agents: string[]; allow: string[]; disallow: string[] };

export function parseRobots(text: string, token: string = ROBOTS_TOKEN): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" && value) current.allow.push(value);
    // An empty Disallow means "allow everything" — nothing to record.
    if (field === "disallow" && value) current.disallow.push(value);
  }

  const lowered = token.toLowerCase();
  const mine = groups.filter((group) => group.agents.some((agent) => agent !== "*" && lowered.includes(agent)));
  const chosen = mine.length > 0 ? mine : groups.filter((group) => group.agents.includes("*"));
  if (chosen.length === 0) return ALLOW_ALL;
  return {
    allow: chosen.flatMap((group) => group.allow),
    disallow: chosen.flatMap((group) => group.disallow),
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function longestMatch(patterns: string[], path: string): number {
  let longest = -1;
  for (const pattern of patterns) {
    if (pattern.length > longest && patternToRegExp(pattern).test(path)) longest = pattern.length;
  }
  return longest;
}

/** Whether `path` (pathname plus search) may be fetched under `rules`. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const target = path || "/";
  const allow = longestMatch(rules.allow, target);
  const disallow = longestMatch(rules.disallow, target);
  if (disallow === -1) return true;
  return allow >= disallow;
}

/** Rules for a robots.txt response, by status — RFC 9309 §2.3.1. */
export function rulesForStatus(status: number, body: string): RobotsRules {
  if (status >= 200 && status < 300) return parseRobots(body);
  if (status >= 400 && status < 500) return ALLOW_ALL;
  return DISALLOW_ALL;
}
