/**
 * Disposable / throwaway email detection.
 *
 * Backed by the `disposable-email-domains` package (MIT): ~121k exact domains
 * plus ~400 wildcard parents whose subdomains are all disposable. Chosen over a
 * vendored list because a hand-maintained file goes stale silently — these
 * services rotate domains constantly — and over an external API because signup
 * must not depend on a third party being reachable.
 *
 * Updating: `npm update disposable-email-domains`, then `npm test`. No codegen,
 * no fixtures to regenerate.
 *
 * Deliberately NOT an allowlist. Blocking everything that is not Gmail/Outlook
 * would break exactly the users this product exists for — founders on their own
 * domains. The only question asked here is "is this domain a known disposable
 * service", and the answer defaults to no.
 *
 * Framework-agnostic and dependency-light on purpose: imported by the Clerk
 * webhook (Node runtime), by server actions, and by tests in plain Node.
 */

// Both entry points are JSON files (the package's `main` is `index.json`), so
// both need the import attribute under ESM.
import disposableDomains from "disposable-email-domains/index.json" with { type: "json" };
import wildcardDomains from "disposable-email-domains/wildcard.json" with { type: "json" };

/*
 * Built once, lazily. The exact list is ~121k strings — a Set turns each check
 * into a hash lookup instead of a linear scan, and deferring construction keeps
 * the cost off cold starts for the many routes that never validate an email.
 */
let exactSet: Set<string> | null = null;
let wildcardList: string[] | null = null;

function getExactSet(): Set<string> {
  if (!exactSet) exactSet = new Set(disposableDomains as string[]);
  return exactSet;
}

function getWildcardList(): string[] {
  if (!wildcardList) wildcardList = wildcardDomains as string[];
  return wildcardList;
}

/**
 * Conservative RFC-shaped check: one `@`, something before it, and a dotted
 * domain after it with a plausible TLD.
 *
 * Not a full RFC 5322 parser by design — that accepts addresses no provider
 * issues, and this runs in front of Clerk, which does its own validation. The
 * job here is to reject the obviously malformed and to extract a domain safely.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export type NormalizedEmail = {
  /** Trimmed and lowercased. */
  email: string;
  /** Everything after the final `@`, lowercased and trailing-dot stripped. */
  domain: string;
};

/**
 * Trim, lowercase, validate shape, extract domain. Returns null when the input
 * is not a usable address.
 *
 * Note what this does NOT do: it does not strip Gmail dots or `+tag` suffixes.
 * Those are the same mailbox to Gmail, but rewriting a user's address changes
 * what we would store and display, and this function's callers only need the
 * domain. Canonicalising the local part is a separate concern from deciding
 * whether the domain is disposable.
 */
export function normalizeEmail(raw: string | null | undefined): NormalizedEmail | null {
  if (typeof raw !== "string") return null;

  // Strip a trailing root dot before validating: "example.com." is a legal
  // FQDN but would fail the shape test, and stripping afterwards left the
  // strip unreachable.
  const email = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (!email || email.length > 254) return null;
  if (!EMAIL_SHAPE.test(email)) return null;

  // Split on the LAST `@`: the local part may legally contain one in a quoted
  // string, and the domain never can.
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  if (!domain) return null;

  return { email, domain };
}

/**
 * Whether `domain` is a known disposable service.
 *
 * Matches the exact list, then walks the wildcard parents so
 * `inbox.10mail.org` is caught by the `10mail.org` entry. The walk is over the
 * ~400 wildcard parents, not the 121k exact list, so it stays cheap.
 */
export function isDisposableDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!normalized) return false;

  if (getExactSet().has(normalized)) return true;

  return getWildcardList().some(
    (parent) => normalized === parent || normalized.endsWith(`.${parent}`),
  );
}

export type EmailCheck =
  | { ok: true; email: string; domain: string }
  | { ok: false; reason: "malformed" | "disposable" };

/**
 * The single entry point callers should use: normalize, then classify.
 *
 * Returns a reason for server-side logging and branching. Callers must NOT
 * surface the reason verbatim — telling a signup attempt which rule fired is
 * free feedback for anyone probing the list. See DISPOSABLE_EMAIL_MESSAGE.
 */
export function checkEmail(raw: string | null | undefined): EmailCheck {
  const normalized = normalizeEmail(raw);
  if (!normalized) return { ok: false, reason: "malformed" };

  if (isDisposableDomain(normalized.domain)) {
    return { ok: false, reason: "disposable" };
  }

  return { ok: true, email: normalized.email, domain: normalized.domain };
}

/** The only wording users see for a disposable address. Says nothing about why. */
export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use a permanent email address to create your BharatHunt account.";
