"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin, isAdminUser } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { getUserProductCount, PRODUCTS_CACHE_PREFIX } from "@/services/products";
import { MAX_GALLERY_IMAGES, MAX_PRODUCTS_PER_USER, PRODUCT_PLATFORMS } from "@/lib/constants";
import { hostnameOf, moderateProduct } from "@/lib/moderation";
import { isIndiaStateCode } from "@/lib/india-states";
import { detectStateCode } from "@/lib/request-geo";
import { notifyReviewers, sendSubmissionAck, type ReviewSubject } from "@/lib/review";

export type ProductFormState = { error?: string } | undefined;

const PRICING_TYPES = ["free", "freemium", "paid"];

/**
 * Normalise a maker-supplied link to an http(s) URL, or null if it can't be one.
 *
 * A bare `example.com` gets `https://`, the way the metadata importer and
 * `hostnameOf` already treat pasted domains — the submit form carries no browser
 * URL validation (see the note in product-form.tsx), so this is the only place
 * that shape is settled. Anything carrying a non-http scheme is dropped, which
 * keeps `javascript:`/`data:` out of the hrefs product pages render.
 */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  // Strip the leading slashes of a protocol-relative `//example.com` first,
  // otherwise prefixing gives the malformed `https:////example.com`.
  const withScheme = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;

  try {
    const parsed = new URL(withScheme);
    // A hostname with no dot is a typo or an intranet name, not a product link.
    if (!parsed.hostname.includes(".")) return null;
  } catch {
    return null;
  }
  // Return the maker's own string (plus any scheme we added) rather than
  // `URL.toString()`, so already-valid links are stored exactly as entered.
  return withScheme;
}

/** Trim a form value and keep it only if it's usable as an http(s) URL. */
function cleanUrl(value: FormDataEntryValue | null): string | null {
  return normalizeUrl(String(value ?? ""));
}

/** Trim and cap a free-text field, returning null when empty. */
function cleanText(value: FormDataEntryValue | null, max: number): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, max) : null;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 60) || "product"
  );
}

type ParsedProductForm = {
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricingType: string;
  websiteUrl: string | null;
  githubUrl: string | null;
  videoUrl: string | null;
  heroImageUrl: string | null;
  screenshotUrls: string[];
  tags: string[];
  // Phase 2 launch fields
  ctaText: string | null;
  ctaUrl: string | null;
  platformLinks: Record<string, string>;
  techStack: string[];
  couponCode: string | null;
  offerDescription: string | null;
  offerExpiresAt: string | null;
  roadmapUrl: string | null;
  changelogUrl: string | null;
  availableForHire: boolean;
  hirePitch: string | null;
  /** ISO 3166-2:IN code, or null when the maker chose not to share one. */
  launchState: string | null;
};

function parseProductForm(formData: FormData): { error: string } | { fields: ParsedProductForm } {
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const pricingType = String(formData.get("pricingType") ?? "free");
  // Raw, so we can tell "left blank" apart from "typed something unusable"
  // below — a link that silently vanishes is worse than a message.
  const websiteUrlRaw = String(formData.get("websiteUrl") ?? "").trim();
  const githubUrlRaw = String(formData.get("githubUrl") ?? "").trim();
  const websiteUrl = normalizeUrl(websiteUrlRaw);
  const githubUrl = normalizeUrl(githubUrlRaw);
  const heroImageUrl = String(formData.get("heroImageUrl") ?? "").trim();
  const screenshotUrls = formData
    .getAll("screenshotUrls")
    .map((value) => String(value).trim())
    .filter((value) => /^https?:\/\//i.test(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, MAX_GALLERY_IMAGES);
  const tagsRaw = String(formData.get("tags") ?? "");

  if (!name || name.length > 60) {
    return { error: "Name is required and must be 60 characters or fewer." };
  }
  if (!tagline || tagline.length > 120) {
    return { error: "Tagline is required and must be 120 characters or fewer." };
  }
  if (!category) {
    return { error: "Please choose a category." };
  }
  if (!PRICING_TYPES.includes(pricingType)) {
    return { error: "Invalid pricing type." };
  }
  if (websiteUrlRaw && !websiteUrl) {
    return { error: "That website link doesn't look right — use a full address like example.com." };
  }
  if (githubUrlRaw && !githubUrl) {
    return { error: "That GitHub link doesn't look right — use a full address like github.com/you/repo." };
  }

  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  // Phase 2 launch fields
  const platformLinks: Record<string, string> = {};
  for (const platform of PRODUCT_PLATFORMS) {
    const url = cleanUrl(formData.get(`platform_${platform.key}`));
    if (url) platformLinks[platform.key] = url;
  }

  const techStack = String(formData.get("techStack") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 12);

  const offerExpiresRaw = String(formData.get("offerExpiresAt") ?? "").trim();
  let offerExpiresAt: string | null = null;
  if (offerExpiresRaw) {
    const parsedDate = new Date(offerExpiresRaw);
    offerExpiresAt = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  return {
    fields: {
      name,
      tagline,
      description: description || null,
      category,
      pricingType,
      websiteUrl,
      githubUrl,
      videoUrl: cleanUrl(formData.get("videoUrl")),
      heroImageUrl: heroImageUrl || null,
      screenshotUrls,
      tags,
      ctaText: cleanText(formData.get("ctaText"), 40),
      ctaUrl: cleanUrl(formData.get("ctaUrl")),
      platformLinks,
      techStack,
      couponCode: cleanText(formData.get("couponCode"), 40),
      offerDescription: cleanText(formData.get("offerDescription"), 200),
      offerExpiresAt,
      roadmapUrl: cleanUrl(formData.get("roadmapUrl")),
      changelogUrl: cleanUrl(formData.get("changelogUrl")),
      availableForHire: formData.get("availableForHire") === "on",
      hirePitch: cleanText(formData.get("hirePitch"), 300),
      // An unrecognised code is dropped rather than rejected — location is
      // optional, and a bad value shouldn't block a launch.
      launchState: launchStateOf(formData.get("launchState")),
    },
  };
}

/** Keep a submitted state only if it's a real ISO 3166-2:IN code. */
function launchStateOf(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  return isIndiaStateCode(raw) ? raw : null;
}

/**
 * Inserts/updates with the richest payload the database will actually accept.
 *
 * Several columns live in migrations that may not have been applied yet, so a
 * write is attempted with every optional group, then with progressively fewer,
 * falling back only on "column does not exist". Without this a pending
 * migration would hard-fail every launch instead of just omitting a field.
 */
async function writeWithOptionalColumns<P extends object, T>(
  base: P,
  optional: object[],
  write: (payload: P) => PromiseLike<{ data: T; error: PostgrestError | null }>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  // Every combination, widest first: all groups, then each group dropped in
  // turn, then none. With two groups that's 4 attempts worst case, and only
  // when columns are genuinely missing.
  const candidates = [
    Object.assign({}, base, ...optional),
    ...optional.map((_, skip) => Object.assign({}, base, ...optional.filter((__, i) => i !== skip))),
    base,
  ] as P[];

  let result: { data: T | null; error: PostgrestError | null } = await write(candidates[0]);
  for (let i = 1; i < candidates.length && result.error && isMissingColumnError(result.error); i++) {
    result = await write(candidates[i]);
  }
  return result;
}

/** `\`, `%` and `_` are LIKE wildcards — escape them before building a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Guards against the same product being listed twice — the cheapest signal
 * that a launch is a duplicate or an impersonation of someone else's product.
 * Matches on the exact name (case-insensitive) or the website's hostname, and
 * returns a ready-to-show message (or null when the launch is unique).
 */
async function findDuplicateLaunch(
  supabase: ReturnType<typeof createClient>,
  { name, websiteUrl, excludeId }: { name: string; websiteUrl: string | null; excludeId?: string },
): Promise<string | null> {
  const host = websiteUrl ? hostnameOf(websiteUrl) : null;

  const [byName, byHost] = await Promise.all([
    supabase.from("products").select("id, name, website_url").ilike("name", escapeLike(name)).limit(5),
    host
      ? supabase
          .from("products")
          .select("id, name, website_url")
          .ilike("website_url", `%${escapeLike(host)}%`)
          .limit(10)
      : null,
  ]);

  const nameClash = (byName.data ?? []).find((row) => row.id !== excludeId);
  if (nameClash) {
    return `A product called "${nameClash.name}" is already on Bharat Hunt. Pick a different name, or edit your existing launch.`;
  }

  if (host) {
    // `ilike` only narrows the candidates — compare parsed hostnames so
    // "notion.so" doesn't collide with "mynotion.social".
    const hostClash = (byHost?.data ?? []).find(
      (row) => row.id !== excludeId && row.website_url && hostnameOf(row.website_url) === host,
    );
    if (hostClash) {
      return `"${hostClash.name}" has already been launched with that website. Each product can only be listed once.`;
    }
  }

  return null;
}

/** The Clerk user record, as `currentUser()` resolves it. */
type ClerkUser = Awaited<ReturnType<typeof currentUser>>;

/**
 * The two mails a submission sends: the queue prompt to the admins, and the
 * acknowledgement to the maker.
 *
 * The maker's address comes from Clerk — `profiles` doesn't store one — so the
 * caller passes the user record it already fetched for the admin check, rather
 * than paying for a second uncached round trip to Clerk's Backend API.
 *
 * Both are awaited rather than handed to `after`. `after` kept sends off the
 * critical path in theory; in practice the callback never ran in production and
 * the mail was lost silently — no email, and no log line saying why, since a
 * callback that does not run cannot report its own absence.
 *
 * Failures are logged, never thrown. The product is already stored and queued,
 * and /admin is the durable record of that — losing the prompt must not look to
 * the maker like a failed launch. Matches the fail-open contract in
 * lib/email.ts.
 */
async function announceSubmission(product: ReviewSubject, user: ClerkUser): Promise<void> {
  const makerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || null;

  await Promise.all([
    notifyReviewers(product, makerName),
    sendSubmissionAck(product, user?.primaryEmailAddress?.emailAddress, makerName),
  ]);
}

/**
 * How long the after-the-insert bookkeeping may hold a maker's redirect.
 *
 * Nothing behind this deadline is load-bearing. The row is committed before any
 * of it starts, and every piece is fail-open by contract (lib/email.ts,
 * lib/cache.ts) — so the only thing it can cost is the maker's patience, and it
 * was quietly authorised to cost all of it. Two Sendgrove round trips cap at
 * 15s *each*, or 30s when the sender falls back to `EMAIL_FALLBACK_FROM`, and
 * the cache sweep walks the whole Redis keyspace with one network hop per
 * `SCAN` page. All of it ran before a single byte of the response went out, so
 * a slow provider showed up on the launch form as a spinner that never ended.
 *
 * Past the deadline we redirect anyway and log what was still running. /admin
 * is the durable record that a launch is waiting; the mail is only the prompt
 * to go and look at it.
 */
const BOOKKEEPING_DEADLINE_MS = 8_000;

/**
 * Awaits `work`, but never for longer than {@link BOOKKEEPING_DEADLINE_MS}.
 *
 * The rejection handler is attached before the race rather than after it, so
 * work that fails *after* the deadline has passed is still logged rather than
 * surfacing as an unhandled rejection that takes the whole invocation with it.
 */
async function withDeadline(label: string, work: Promise<unknown>): Promise<void> {
  const settled = work.then(
    () => "done" as const,
    (error: unknown) => {
      console.error(`[launch] ${label} failed:`, error);
      return "done" as const;
    },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), BOOKKEEPING_DEADLINE_MS);
  });

  try {
    if ((await Promise.race([settled, deadline])) === "timeout") {
      console.error(
        `[launch] ${label} was still running after ${BOOKKEEPING_DEADLINE_MS}ms — ` +
          "finishing the launch without it.",
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every existing slug that could collide with `baseSlug`, in one round trip.
 *
 * Slug selection used to probe candidates one at a time — a sequential query
 * per attempt, on the critical path of every launch, just to learn that the
 * obvious slug was free. Reading the neighbourhood once and picking locally
 * costs the same single query whether the name is unique or contested.
 */
async function takenSlugsNear(
  supabase: ReturnType<typeof createClient>,
  baseSlug: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("products")
    .select("slug")
    .like("slug", `${escapeLike(baseSlug)}%`)
    .limit(100);
  return new Set((data ?? []).map((row) => row.slug));
}

/** The first free slug for this name: `name`, else `name-xxxx`. */
function resolveSlug(baseSlug: string, taken: Set<string>): string {
  if (!taken.has(baseSlug)) return baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 100 rows cannot exhaust a 36^4 suffix space, but never hand back a slug we
  // know is taken — the insert would just fail on the unique index.
  return `${baseSlug}-${Date.now().toString(36)}`;
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  /*
   * Distinct from MAX_PRODUCTS_PER_USER below. That is a lifetime cap on rows
   * that survive; it says nothing about attempt rate, and delete-then-resubmit
   * cycles straight past it. This bounds the rate, including for admins, who
   * are exempt from the launch cap.
   */
  const rate = await checkRateLimitByIpAndUser("productCreate", userId);
  if (!rate.ok) {
    return { error: rate.message };
  }

  const supabase = createClient();

  // Free checks first: a malformed or rule-breaking form is rejected without
  // spending a single round trip on it.
  const parsed = parseProductForm(formData);
  if ("error" in parsed) {
    return parsed;
  }

  // Launch rules: no adult/NSFW or fraudulent listings, and no fake launches
  // (see lib/moderation.ts). Runs before anything is written.
  const moderation = moderateProduct(parsed.fields);
  if (!moderation.ok) {
    return { error: moderation.message };
  }

  const baseSlug = slugify(parsed.fields.name);

  /*
   * Everything a launch has to look up before it can be written, issued at
   * once. None of these depend on each other, and run one after another they
   * were five serial network hops (Clerk, then four Postgres queries) that the
   * maker sat through with a spinner. Each verdict is still applied below in
   * the same order as before, so the message a rejected launch gets is
   * unchanged — only the waiting is.
   */
  const [user, existingCount, duplicate, profileError, takenSlugs] = await Promise.all([
    // A Clerk blip costs the admin exemption and the receipt, not the launch.
    currentUser().catch((error: unknown) => {
      console.error("[launch] could not read the maker's Clerk record:", error);
      return null;
    }),
    getUserProductCount(userId),
    findDuplicateLaunch(supabase, {
      name: parsed.fields.name,
      websiteUrl: parsed.fields.websiteUrl,
    }),
    // Make sure the creator has a profile row before inserting — products.creator_id
    // has a FK to profiles.id, and the Clerk webhook may not have run for this user.
    ensureProfile().then(
      () => null,
      (error: unknown) =>
        error instanceof Error
          ? error.message
          : "Could not prepare your profile. Please try again.",
    ),
    takenSlugsNear(supabase, baseSlug),
  ]);

  // Enforce the per-maker launch limit — admins are exempt.
  if (!isAdminUser(user) && existingCount >= MAX_PRODUCTS_PER_USER) {
    return {
      error: `You've reached the ${MAX_PRODUCTS_PER_USER}-product launch limit. Delete an existing product to launch a new one.`,
    };
  }

  if (duplicate) {
    return { error: duplicate };
  }

  if (profileError) {
    return { error: profileError };
  }

  const {
    name,
    tagline,
    description,
    category,
    pricingType,
    websiteUrl,
    githubUrl,
    videoUrl,
    heroImageUrl,
    screenshotUrls,
    tags,
    ctaText,
    ctaUrl,
    platformLinks,
    techStack,
    couponCode,
    offerDescription,
    offerExpiresAt,
    roadmapUrl,
    changelogUrl,
    availableForHire,
    hirePitch,
    launchState,
  } = parsed.fields;

  // Provenance is derived from a fresh server-side lookup rather than a hidden
  // form field, so it records what the request actually looked like and can't
  // be spoofed by the client. Detection never overrides the maker: if they
  // cleared the field, `launchState` is null and nothing is stored.
  const detectedState = launchState ? await detectStateCode() : null;

  const slug = resolveSlug(baseSlug, takenSlugs);

  const basePayload = {
    creator_id: userId,
    slug,
    name,
    tagline,
    description,
    category,
    pricing_type: pricingType,
    website_url: websiteUrl,
    github_url: githubUrl,
    video_url: videoUrl,
    hero_image_url: heroImageUrl,
    screenshot_urls: screenshotUrls,
    tags,
    /*
     * Submitted, not live. The review trigger in
     * 20260825000000_launch_review_queue.sql refuses any other status from a
     * maker's session, and `published_at` is written by the approval — an
     * unreviewed product has never been published, so it has no publish date.
     */
    status: "pending",
  };
  const launchFields = {
    cta_text: ctaText,
    cta_url: ctaUrl,
    platform_links: platformLinks,
    tech_stack: techStack,
    coupon_code: couponCode,
    offer_description: offerDescription,
    offer_expires_at: offerExpiresAt,
    roadmap_url: roadmapUrl,
    changelog_url: changelogUrl,
    available_for_hire: availableForHire,
    hire_pitch: hirePitch,
  };
  const locationFields = {
    launch_state: launchState,
    launch_state_source: launchState ? (launchState === detectedState ? "detected" : "maker") : null,
  };

  const { data: product, error } = await writeWithOptionalColumns(
    basePayload,
    [launchFields, locationFields],
    (payload) => supabase.from("products").insert(payload).select("id, slug").single(),
  );

  if (error || !product) {
    return { error: error?.message ?? "Could not submit your product. Please try again." };
  }

  /*
   * The submission exists now; the rest is bookkeeping the maker is only waiting
   * on because it has to finish before the redirect. Run it together rather than
   * stacking a Redis SCAN sweep on top of two email round trips — and under a
   * deadline, so neither can hold the launch open (see `withDeadline`).
   *
   * The public caches are still invalidated even though nothing public changed
   * yet: the per-user product count that enforces the launch limit is read
   * through the same prefix.
   */
  await withDeadline(
    "submission bookkeeping",
    Promise.all([
      cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX),
      announceSubmission(
        {
          id: product.id,
          slug: product.slug,
          name,
          tagline,
          description,
          category,
          pricingType,
          websiteUrl,
          githubUrl,
          launchState,
        },
        user,
      ),
    ]),
  );
  // It's a new row on the maker's dashboard, and a new row in the admin queue.
  revalidatePath("/dashboard");
  revalidatePath("/admin");

  /*
   * The product page filters on `status = 'published'`, so a pending product
   * would 404 there. The dashboard is where a submission is legible anyway —
   * it shows the review state, and `submitted` turns the banner on.
   */
  redirect(`/dashboard?submitted=${encodeURIComponent(product.slug)}`);
}

export async function updateProduct(
  productId: string,
  productSlug: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const rate = await checkRateLimitByIpAndUser("productUpdate", userId);
  if (!rate.ok) {
    return { error: rate.message };
  }

  const supabase = createClient();

  const parsed = parseProductForm(formData);
  if ("error" in parsed) {
    return parsed;
  }

  // Same launch rules as create — an edit can't smuggle in banned content.
  const moderation = moderateProduct(parsed.fields);
  if (!moderation.ok) {
    return { error: moderation.message };
  }

  // Independent of each other, and both were on the critical path of every
  // save — the admin check is a Clerk API call, the duplicate check two
  // Postgres queries.
  const [isAdmin, duplicate] = await Promise.all([
    getIsAdmin(),
    findDuplicateLaunch(supabase, {
      name: parsed.fields.name,
      websiteUrl: parsed.fields.websiteUrl,
      excludeId: productId,
    }),
  ]);
  if (duplicate) {
    return { error: duplicate };
  }

  const {
    name,
    tagline,
    description,
    category,
    pricingType,
    websiteUrl,
    githubUrl,
    videoUrl,
    heroImageUrl,
    screenshotUrls,
    tags,
    ctaText,
    ctaUrl,
    platformLinks,
    techStack,
    couponCode,
    offerDescription,
    offerExpiresAt,
    roadmapUrl,
    changelogUrl,
    availableForHire,
    hirePitch,
    launchState,
  } = parsed.fields;

  // Admins may edit any product (service-role client bypasses RLS); everyone
  // else is scoped to their own rows.
  const db = isAdmin ? createServiceClient() : supabase;

  const basePayload = {
    name,
    tagline,
    description,
    category,
    pricing_type: pricingType,
    website_url: websiteUrl,
    github_url: githubUrl,
    video_url: videoUrl,
    hero_image_url: heroImageUrl,
    screenshot_urls: screenshotUrls,
    tags,
  };
  const launchFields = {
    cta_text: ctaText,
    cta_url: ctaUrl,
    platform_links: platformLinks,
    tech_stack: techStack,
    coupon_code: couponCode,
    offer_description: offerDescription,
    offer_expires_at: offerExpiresAt,
    roadmap_url: roadmapUrl,
    changelog_url: changelogUrl,
    available_for_hire: availableForHire,
    hire_pitch: hirePitch,
  };
  // On an edit the value is always a deliberate choice, so it's never marked
  // "detected" — and we don't re-run geo-IP, which would otherwise relabel a
  // product with wherever the maker happens to be sitting today.
  const locationFields = {
    launch_state: launchState,
    launch_state_source: launchState ? "maker" : null,
  };

  const runUpdate = (payload: typeof basePayload) => {
    let query = db.from("products").update(payload).eq("id", productId);
    if (!isAdmin) {
      query = query.eq("creator_id", userId);
    }
    return query;
  };

  const { error } = await writeWithOptionalColumns(basePayload, [launchFields, locationFields], runUpdate);

  if (error) {
    return { error: error.message };
  }

  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  // The dashboard shows name/tagline/status, so an edit changes it too.
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  /*
   * The homepage is a prerender now (`dynamic = "force-static"` in app/page.tsx),
   * so an edited name, tagline or logo would otherwise sit stale in the hero and
   * the "Also climbing" grid until the revalidate window elapsed. Dropping a
   * Redis key no longer refreshes it — only the route cache does.
   */
  revalidatePath("/");

  redirect(`/products/${productSlug}`);
}

export type DeleteProductState = { error?: string } | undefined;

/**
 * Deletes a product and refreshes every view that listed it.
 *
 * `redirectTo` is where the caller lands afterwards: the product page passes
 * "/marketplace" (the page it's on is about to 404), while the admin dashboard
 * passes `null` to stay put — the revalidated table just drops the row. A
 * failed delete returns an error instead of silently pretending it worked.
 */
export async function deleteProduct(
  productId: string,
  redirectTo: string | null = "/marketplace",
): Promise<DeleteProductState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const rate = await checkRateLimitByIpAndUser("productDelete", userId);
  if (!rate.ok) {
    return { error: rate.message };
  }

  const supabase = createClient();

  // Admins may delete any product; everyone else only their own.
  const isAdmin = await getIsAdmin();
  const db = isAdmin ? createServiceClient() : supabase;
  let query = db.from("products").delete().eq("id", productId);
  if (!isAdmin) {
    query = query.eq("creator_id", userId);
  }
  // `select()` makes the delete return the rows it removed, so we can tell a
  // real deletion apart from one RLS silently matched nothing for.
  const { data: deleted, error } = await query.select("slug");

  if (error) {
    return { error: `Couldn't delete that product: ${error.message}` };
  }
  if (!deleted || deleted.length === 0) {
    return {
      error: "That product no longer exists, or you don't have permission to delete it.",
    };
  }

  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);

  // Drop the row from every cached render that showed it. Revalidating the two
  // dashboards is what lets them refresh in place instead of navigating away.
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/marketplace");
  // Same reason as the edit path: the homepage prerender can be holding this
  // product in the hero, and a card linking to a 404 is worse than a stale one.
  revalidatePath("/");
  for (const { slug } of deleted) {
    revalidatePath(`/products/${slug}`);
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
}
