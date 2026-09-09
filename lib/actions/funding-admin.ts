"use server";

/**
 * Admin write actions for Funding Intelligence.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint anyone can
 * post to, and these publish funding claims under this site's name — so each
 * one re-establishes identity and re-checks admin status as its first two
 * statements. The page's `getIsAdmin()` guard decides what is *rendered*; it is
 * not what authorizes anything. Same contract as `lib/actions/admin-investors.ts`.
 *
 * Publishing is the whole point of this file
 * ------------------------------------------
 * `funding_rounds` has no write policy at all, so nothing in the browser can
 * set `status`, `verified` or `is_featured` no matter what it posts. These
 * actions are the only path to `'published'`, and they run under the service
 * role after the admin check — the same shape the launch review queue uses
 * (`lib/review.ts`), for the same reason.
 */

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAdminUser } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { FUNDING_CACHE_PREFIX, FUNDING_CITIES, FUNDING_INDUSTRIES } from "@/lib/funding/constants";
import { asFundingStage } from "@/lib/funding/extract";
import { toInr } from "@/lib/funding/format";
import { fundingEventKey, normalizeEntityName, slugify } from "@/lib/funding/normalize";
import { runIngestion } from "@/lib/funding/ingest";

export type FundingAdminResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Identity, then admin, then the caller's email for the audit trail.
 *
 * `currentUser()` is an HTTP call to Clerk on every invocation with no request
 * memo, so it is made once and `isAdminUser` is applied to the result — rather
 * than calling `getIsAdmin()` and then fetching the same record again to find
 * out who acted.
 */
async function requireAdmin(): Promise<
  { ok: true; actor: string } | { ok: false; error: string }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };

  const user = await currentUser();
  if (!isAdminUser(user)) {
    console.warn(
      JSON.stringify({ event: "funding_admin_denied", userId, at: new Date().toISOString() }),
    );
    return { ok: false, error: "You do not have access to manage funding data." };
  }

  return {
    ok: true,
    actor: user?.emailAddresses[0]?.emailAddress ?? userId,
  };
}

/**
 * Drop every cached funding read and re-render the pages built on them.
 *
 * Both halves are needed: `cacheRemember` keys live in Redis with a two-minute
 * TTL and would otherwise serve the pre-approval feed for that long, while the
 * route cache holds the rendered page. Coarse on purpose — approvals are rare
 * relative to reads, so invalidating the prefix costs nothing worth optimising.
 */
async function invalidateFunding(startupSlug?: string): Promise<void> {
  await cacheInvalidatePrefix(FUNDING_CACHE_PREFIX);
  revalidatePath("/funding");
  revalidatePath("/funding/investors");
  if (startupSlug) revalidatePath(`/funding/${startupSlug}`);
}

// ── Review decisions ─────────────────────────────────────────────────────

/**
 * Publish a round.
 *
 * `verified: true` is set here and nowhere else. It means a person read this
 * record against its source — extraction never sets it, which is what makes the
 * badge on the card worth anything.
 *
 * `published_at` is stamped only on the first publish; re-approving a round
 * that was hidden and restored must not make it look new.
 */
export async function approveFundingRound(
  id: string,
  options?: { verified?: boolean },
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("funding_rounds")
    .select("published_at, startup_slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("funding_rounds")
    .update({
      status: "published",
      is_hidden: false,
      verified: options?.verified ?? true,
      reviewed_by: gate.actor,
      reviewed_at: new Date().toISOString(),
      published_at: existing?.published_at ?? new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not publish: ${error.message}` };

  await invalidateFunding(existing?.startup_slug);
  return { ok: true, message: "Published." };
}

/**
 * Reject a round.
 *
 * The row is kept, not deleted. A rejected round is what stops the same article
 * being re-extracted into the same record on the next run — its `event_key`
 * still occupies the unique index — and it is the record of a decision someone
 * may need to revisit.
 */
export async function rejectFundingRound(id: string, note?: string): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("funding_rounds")
    .select("startup_slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("funding_rounds")
    .update({
      status: "rejected",
      reviewed_by: gate.actor,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim().slice(0, 500) || null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not reject: ${error.message}` };

  await invalidateFunding(existing?.startup_slug);
  return { ok: true, message: "Rejected." };
}

/**
 * Take a published round off the page immediately.
 *
 * Distinct from rejecting: hiding is the fast, reversible answer to "this looks
 * wrong, get it down while I check", and it leaves the review history intact.
 * The public RLS policy tests `not is_hidden`, so this is effective the moment
 * the cache is dropped.
 */
export async function setFundingRoundHidden(
  id: string,
  hidden: boolean,
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("funding_rounds")
    .select("startup_slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("funding_rounds")
    .update({ is_hidden: hidden })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not update: ${error.message}` };

  await invalidateFunding(existing?.startup_slug);
  return { ok: true, message: hidden ? "Hidden." : "Visible again." };
}

/** Pin a round to the top of the default feed. */
export async function setFundingRoundFeatured(
  id: string,
  featured: boolean,
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("funding_rounds")
    .update({ is_featured: featured })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not update: ${error.message}` };

  await invalidateFunding();
  return { ok: true, message: featured ? "Featured." : "Unfeatured." };
}

// ── Editing ──────────────────────────────────────────────────────────────

export type FundingRoundInput = {
  startupName?: unknown;
  headline?: unknown;
  summary?: unknown;
  amountNumeric?: unknown;
  currency?: unknown;
  amountText?: unknown;
  fundingStage?: unknown;
  industry?: unknown;
  subIndustry?: unknown;
  location?: unknown;
  city?: unknown;
  investors?: unknown;
  leadInvestor?: unknown;
  announcementDate?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/** Accepts an array or a comma-separated string, same as the investor admin form. */
function names(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim().slice(0, 70);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * A whole-major-unit amount, or null.
 *
 * An empty field means "not reported" and must land as null, never 0 — a zero
 * on this column would render as "₹0 raised", which is a claim nobody made.
 */
function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const rounded = Math.round(parsed);
  return rounded > 5_000_000_000_000 ? null : rounded;
}

/** An ISO date (YYYY-MM-DD), or null if it is not one. */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value.trim());
  if (!match) return null;
  const parsed = new Date(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value.trim();
}

/**
 * Correct an extracted record.
 *
 * Every field is re-derived from the input rather than trusted, on the same
 * argument as any other server action — but the interesting part is what is
 * recomputed rather than accepted: `amount_inr`, `fx_rate_to_inr`,
 * `startup_slug` and `event_key` are all derived here from the corrected
 * values. An admin who fixes a stage from "Seed" to "Series A" must not leave
 * behind an `event_key` that still says Seed, or the next article about the
 * round would fail to recognise it as a duplicate.
 *
 * `extraction_method` becomes 'manual': once a person has edited the record it
 * is no longer a machine's reading of the article, and the card should stop
 * claiming it is.
 */
export async function updateFundingRound(
  id: string,
  input: FundingRoundInput,
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const startupName = text(input.startupName, 160);
  if (!startupName) return { ok: false, error: "A company name is required." };

  const headline = text(input.headline, 300);
  if (!headline) return { ok: false, error: "A headline is required." };

  const stage = asFundingStage(input.fundingStage) ?? "Undisclosed";
  const announcementDate = isoDate(input.announcementDate);
  if (!announcementDate) return { ok: false, error: "A valid announcement date is required." };

  const startupSlug = slugify(startupName);
  if (!startupSlug) return { ok: false, error: "That company name has no usable URL slug." };

  const amountNumeric = amount(input.amountNumeric);
  const currency = amountNumeric === null ? null : (text(input.currency, 3) ?? "INR");
  const converted = toInr(amountNumeric, currency);

  const industry = FUNDING_INDUSTRIES.includes(
    text(input.industry, 40) as (typeof FUNDING_INDUSTRIES)[number],
  )
    ? text(input.industry, 40)
    : null;

  const city = FUNDING_CITIES.includes(text(input.city, 40) as (typeof FUNDING_CITIES)[number])
    ? text(input.city, 40)
    : null;

  const investors = names(input.investors);
  const leadInvestor = text(input.leadInvestor, 70);

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("funding_rounds")
    .select("startup_slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("funding_rounds")
    .update({
      startup_name: startupName,
      startup_slug: startupSlug,
      headline,
      summary: text(input.summary, 900),
      amount: text(input.amountText, 60),
      amount_numeric: amountNumeric,
      currency,
      amount_inr: converted?.inr ?? null,
      fx_rate_to_inr: converted?.rate ?? null,
      funding_stage: stage,
      industry,
      sub_industry: text(input.subIndustry, 60),
      location: text(input.location, 120),
      city,
      investors,
      lead_investor: leadInvestor,
      announcement_date: announcementDate,
      source_name: text(input.sourceName, 120) ?? "Unknown",
      event_key: fundingEventKey({ startupName, stage, date: announcementDate }),
      extraction_method: "manual",
      reviewed_by: gate.actor,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // The event_key unique index: this edit makes the round identical to one
    // that already exists, which almost always means they are the same event.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Another round already exists for that company, stage and month.",
      };
    }
    return { ok: false, error: `Could not save: ${error.message}` };
  }

  await syncRoundEntities(id, startupName, startupSlug, investors, leadInvestor);
  await invalidateFunding(existing?.startup_slug);
  if (startupSlug !== existing?.startup_slug) revalidatePath(`/funding/${startupSlug}`);

  return { ok: true, message: "Saved." };
}

/**
 * Add a round by hand.
 *
 * The escape hatch that makes the whole feature usable on day one: an admin who
 * knows about a round can enter it without waiting for a feed to carry it.
 * Published immediately and marked `verified` — a human typed it from a source
 * they are looking at, which is a stronger provenance than anything the
 * pipeline produces.
 */
export async function createManualFundingRound(
  input: FundingRoundInput,
): Promise<FundingAdminResult & { id?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const startupName = text(input.startupName, 160);
  const headline = text(input.headline, 300);
  const sourceUrl = text(input.sourceUrl, 500);
  const announcementDate = isoDate(input.announcementDate);

  if (!startupName) return { ok: false, error: "A company name is required." };
  if (!headline) return { ok: false, error: "A headline is required." };
  if (!announcementDate) return { ok: false, error: "A valid announcement date is required." };
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    // Non-negotiable: every figure on this page is attributable to a source a
    // reader can open. A record with no link is a rumour.
    return { ok: false, error: "A source URL (http/https) is required." };
  }

  const startupSlug = slugify(startupName);
  if (!startupSlug) return { ok: false, error: "That company name has no usable URL slug." };

  const stage = asFundingStage(input.fundingStage) ?? "Undisclosed";
  const amountNumeric = amount(input.amountNumeric);
  const currency = amountNumeric === null ? null : (text(input.currency, 3) ?? "INR");
  const converted = toInr(amountNumeric, currency);
  const investors = names(input.investors);
  const leadInvestor = text(input.leadInvestor, 70);

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("funding_rounds")
    .insert({
      startup_name: startupName,
      startup_slug: startupSlug,
      headline,
      summary: text(input.summary, 900),
      amount: text(input.amountText, 60),
      amount_numeric: amountNumeric,
      currency,
      amount_inr: converted?.inr ?? null,
      fx_rate_to_inr: converted?.rate ?? null,
      funding_stage: stage,
      industry: FUNDING_INDUSTRIES.includes(
        text(input.industry, 40) as (typeof FUNDING_INDUSTRIES)[number],
      )
        ? text(input.industry, 40)
        : null,
      location: text(input.location, 120),
      city: FUNDING_CITIES.includes(text(input.city, 40) as (typeof FUNDING_CITIES)[number])
        ? text(input.city, 40)
        : null,
      investors,
      lead_investor: leadInvestor,
      announcement_date: announcementDate,
      source_name: text(input.sourceName, 120) ?? "Bharat Hunt",
      source_url: sourceUrl,
      status: "published",
      verified: true,
      confidence_score: 1,
      extraction_method: "manual",
      event_key: fundingEventKey({ startupName, stage, date: announcementDate }),
      published_at: new Date().toISOString(),
      reviewed_by: gate.actor,
      reviewed_at: new Date().toISOString(),
      // No `news_id`: there is no article row behind a hand-entered round, and
      // the source is recorded where it belongs — `source_name` and
      // `source_url`, the two fields the card actually renders.
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "A round already exists for that company, stage and month.",
      };
    }
    return { ok: false, error: `Could not save: ${error.message}` };
  }

  await syncRoundEntities(data.id, startupName, startupSlug, investors, leadInvestor);
  await invalidateFunding(startupSlug);

  return { ok: true, id: data.id, message: "Added." };
}

/**
 * Re-point a round at the right company and investor rows after an edit.
 *
 * Necessary because the counters on those rows are also their RLS predicates
 * (20260909000000 §2, §3): a round whose company was corrected has to detach
 * from the old row and attach to the new one, or the old company keeps a page
 * built on a round it no longer has. The triggers recompute both sides once the
 * links move.
 */
async function syncRoundEntities(
  roundId: string,
  startupName: string,
  startupSlug: string,
  investors: string[],
  leadInvestor: string | null,
): Promise<void> {
  const supabase = createServiceClient();

  const normalizedCompany = normalizeEntityName(startupName);
  if (normalizedCompany) {
    const { data: startup } = await supabase
      .from("funding_startups")
      .select("id")
      .eq("normalized_name", normalizedCompany)
      .maybeSingle();

    let startupId = startup?.id ?? null;
    if (!startupId) {
      const { data: created } = await supabase
        .from("funding_startups")
        .insert({ name: startupName, slug: startupSlug, normalized_name: normalizedCompany })
        .select("id")
        .maybeSingle();
      startupId = created?.id ?? null;
    }

    if (startupId) {
      await supabase.from("funding_rounds").update({ startup_id: startupId }).eq("id", roundId);
    }
  }

  // Replace the investor links wholesale. An admin who removed a name from the
  // list means it should stop counting toward that investor's deal count, and
  // deleting first is the only way that reliably happens.
  await supabase.from("funding_round_investors").delete().eq("round_id", roundId);

  for (const name of investors) {
    const normalized = normalizeEntityName(name);
    const slug = slugify(name);
    if (!normalized || !slug) continue;

    const { data: investor } = await supabase
      .from("funding_investors")
      .select("id")
      .eq("normalized_name", normalized)
      .maybeSingle();

    let investorId = investor?.id ?? null;
    if (!investorId) {
      const { data: created } = await supabase
        .from("funding_investors")
        .insert({ name, slug, normalized_name: normalized })
        .select("id")
        .maybeSingle();
      investorId = created?.id ?? null;
    }

    if (!investorId) continue;

    await supabase.from("funding_round_investors").upsert(
      {
        round_id: roundId,
        investor_id: investorId,
        is_lead: leadInvestor !== null && name.toLowerCase() === leadInvestor.toLowerCase(),
      },
      { onConflict: "round_id,investor_id" },
    );
  }
}

// ── Sources ──────────────────────────────────────────────────────────────

/** Turn a feed on or off. The reason the sources table exists. */
export async function setFundingSourceEnabled(
  id: string,
  enabled: boolean,
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("funding_sources")
    .update({
      enabled,
      // Re-enabling clears the backoff. An operator who has just fixed a feed
      // should not have to wait out the penalty its previous failures earned.
      ...(enabled ? { consecutive_failures: 0, is_healthy: true, last_error: null } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not update source: ${error.message}` };

  revalidatePath("/admin/funding");
  return { ok: true, message: enabled ? "Source enabled." : "Source disabled." };
}

/** Change how often a source is polled. */
export async function setFundingSourceInterval(
  id: string,
  minutes: number,
): Promise<FundingAdminResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  // The same bounds the CHECK constraint enforces, so a bad value is refused
  // with a sentence rather than a Postgres error.
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
    return { ok: false, error: "Interval must be between 5 and 1440 minutes." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("funding_sources")
    .update({ poll_interval_minutes: minutes })
    .eq("id", id);

  if (error) return { ok: false, error: `Could not update source: ${error.message}` };

  revalidatePath("/admin/funding");
  return { ok: true, message: "Interval updated." };
}

export type ManualIngestionResult =
  | { ok: true; message: string; detail: Awaited<ReturnType<typeof runIngestion>> }
  | { ok: false; error: string };

/**
 * The "Run ingestion now" button.
 *
 * `force: true` — an admin pressing this means now, not "if the interval has
 * elapsed". Safe because the run is idempotent: the worst a repeated press does
 * is re-fetch feeds and find every article already stored.
 *
 * The budget is shorter than the cron path's default. This one blocks a Server
 * Action while a person watches a spinner, and a partial run that reports what
 * it did is better than one that is killed by a platform timeout with nothing
 * on screen — the next scheduled run picks up the rest.
 */
export async function runFundingIngestionNow(sourceId?: string): Promise<ManualIngestionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  try {
    const detail = await runIngestion({
      trigger: "admin",
      sourceId,
      force: true,
      budgetMs: 25_000,
    });

    await invalidateFunding();
    revalidatePath("/admin/funding");

    const parts = [
      `${detail.articlesFetched} fetched`,
      `${detail.roundsCreated} new round${detail.roundsCreated === 1 ? "" : "s"}`,
      `${detail.duplicates} duplicate${detail.duplicates === 1 ? "" : "s"}`,
      `${detail.rejected} rejected`,
    ];
    if (detail.errors > 0) parts.push(`${detail.errors} error${detail.errors === 1 ? "" : "s"}`);
    if (detail.budgetExhausted) parts.push("stopped at the time budget");

    return { ok: true, message: parts.join(" · "), detail };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ingestion failed.",
    };
  }
}
