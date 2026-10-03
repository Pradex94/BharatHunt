/**
 * Every Product Intelligence cache key shares this prefix, so a rebuild clears
 * them all with one `cacheInvalidatePrefix`. Its own module (no imports) so
 * both the server-only indexer and the read services can share it.
 */
export const INTELLIGENCE_CACHE_PREFIX = "bh:intel:";
