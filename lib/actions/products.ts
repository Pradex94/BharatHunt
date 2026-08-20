"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { getUserProductCount, PRODUCTS_CACHE_PREFIX } from "@/services/products";
import { MAX_GALLERY_IMAGES, MAX_PRODUCTS_PER_USER, PRODUCT_PLATFORMS } from "@/lib/constants";
import { hostnameOf, moderateProduct } from "@/lib/moderation";
import { isIndiaStateCode } from "@/lib/india-states";
import { detectStateCode } from "@/lib/request-geo";
import { sendEmail } from "@/lib/email";
import { buildProductLaunchEmail } from "@/lib/emails/product-launch";

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

/**
 * Emails the maker their launch receipt.
 *
 * The address comes from Clerk — `profiles` doesn't store one — so this needs
 * the request's auth context and has to be resolved before `redirect` unwinds
 * the action.
 *
 * The send is awaited rather than handed to `after`. `after` kept it off the
 * critical path in theory; in practice the callback never ran in production and
 * the receipt was lost silently — no email, and no log line saying why, since a
 * callback that does not run cannot report its own absence.
 *
 * Awaiting adds the provider round trip (a few hundred milliseconds, capped by
 * the 15s timeout in lib/email.ts) before the redirect. Failures are logged,
 * never thrown — the product is already published, and losing the receipt must
 * not look like a failed launch. Matches the fail-open contract in lib/email.ts.
 */
async function sendLaunchReceipt(product: {
  name: string;
  tagline: string;
  slug: string;
  category: string;
  launchState: string | null;
}): Promise<void> {
  let recipient: string | undefined;
  let makerName: string | null = null;

  try {
    const user = await currentUser();
    recipient = user?.primaryEmailAddress?.emailAddress;
    makerName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || null;
  } catch (error) {
    console.error("[launch-email] could not read the maker's address from Clerk:", error);
    return;
  }

  if (!recipient) {
    // Clerk accounts can exist without a primary email (phone-only sign-up).
    return;
  }

  const to = recipient;
  const email = buildProductLaunchEmail(product, makerName);

  const sent = await sendEmail({ to, ...email });
  // Log the slug, not the address — this lands in shared platform logs.
  if (!sent.ok) {
    console.error(`[launch-email] "${product.slug}" was not delivered: ${sent.error}`);
  }
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

  // Enforce the per-maker launch limit before doing any work — admins are exempt.
  if (!(await getIsAdmin())) {
    const existingCount = await getUserProductCount(userId);
    if (existingCount >= MAX_PRODUCTS_PER_USER) {
      return {
        error: `You've reached the ${MAX_PRODUCTS_PER_USER}-product launch limit. Delete an existing product to launch a new one.`,
      };
    }
  }

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

  const duplicate = await findDuplicateLaunch(supabase, {
    name: parsed.fields.name,
    websiteUrl: parsed.fields.websiteUrl,
  });
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

  // Provenance is derived from a fresh server-side lookup rather than a hidden
  // form field, so it records what the request actually looked like and can't
  // be spoofed by the client. Detection never overrides the maker: if they
  // cleared the field, `launchState` is null and nothing is stored.
  const detectedState = launchState ? await detectStateCode() : null;

  // Make sure the creator has a profile row before inserting — products.creator_id
  // has a FK to profiles.id, and the Clerk webhook may not have run for this user.
  try {
    await ensureProfile();
  } catch (profileError) {
    return {
      error:
        profileError instanceof Error
          ? profileError.message
          : "Could not prepare your profile. Please try again.",
    };
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

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
    status: "published",
    published_at: new Date().toISOString(),
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
    (payload) => supabase.from("products").insert(payload).select("slug").single(),
  );

  if (error || !product) {
    return { error: error?.message ?? "Could not publish your product. Please try again." };
  }

  // A new product changes lists, featured, counts, stats and the sitemap.
  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  // …and it's a new row on the maker's dashboard.
  revalidatePath("/dashboard");

  await sendLaunchReceipt({
    name,
    tagline,
    slug: product.slug,
    category,
    launchState,
  });

  redirect(`/products/${product.slug}`);
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

  const duplicate = await findDuplicateLaunch(supabase, {
    name: parsed.fields.name,
    websiteUrl: parsed.fields.websiteUrl,
    excludeId: productId,
  });
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
  const isAdmin = await getIsAdmin();
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
  for (const { slug } of deleted) {
    revalidatePath(`/products/${slug}`);
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
}
