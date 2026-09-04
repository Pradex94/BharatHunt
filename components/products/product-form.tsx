"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Flame,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { fetchUrlMetadata } from "@/lib/actions/fetch-metadata";
import {
  MAX_GALLERY_IMAGES,
  PRODUCT_CATEGORIES,
  PRICING_TYPE_LABELS,
  PRODUCT_PLATFORMS,
} from "@/lib/constants";
import { INDIA_STATES } from "@/lib/india-states";
import { moderateProduct, SUBMISSION_RULES, type ModerationCode } from "@/lib/moderation";
import type { Json } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductLogo } from "@/components/products/product-logo";
import {
  MAX_UPLOAD_BYTES,
  MIN_GALLERY_IMAGE_WIDTH,
  MIN_LOGO_PIXELS,
  uploadProductImage,
} from "@/lib/upload";
import { MAX_NAME_LENGTH } from "@/lib/metadata-extract";
import { cn } from "@/lib/utils";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/**
 * The form is split into steps (Product-Hunt style) because the full field set
 * is long enough to be intimidating in one scroll. Every panel stays MOUNTED
 * and is hidden with `display:none`, so a single <form> still submits every
 * field in one go.
 *
 * That means NO browser constraint validation anywhere in here: a hidden
 * control that fails validation can't be focused, so the browser silently
 * aborts the submit instead of reporting it. Hence no `required`, and hence
 * `noValidate` on the <form> below — `type="url"`/`pattern`/`min` would each
 * kill Publish the same way. Step gating is done in `validateStep`, and the
 * server re-checks everything regardless.
 */
const STEPS = [
  { id: "main", label: "Main info", icon: Rocket },
  { id: "media", label: "Images and media", icon: ImageIcon },
  { id: "links", label: "Links", icon: Link2 },
  { id: "extras", label: "Extras", icon: Flame },
  { id: "review", label: "Review and launch", icon: CircleCheck },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Which step a rejected launch rule belongs to, so we can jump the maker there. */
/** Steps carrying required fields, in the order a maker should be sent to fix them. */
const REQUIRED_STEPS: StepId[] = ["main", "links"];

/**
 * How long a submit may stay in flight before the form stops covering the page
 * and hands control back. See the note on `stalled` in the component.
 *
 * Well past a healthy launch (a few seconds, most of it the redirect's render)
 * and past a slow one on a bad connection, but short enough that a maker has
 * not yet given up and closed the tab.
 */
const PUBLISH_STALL_MS = 25_000;

/**
 * How far down the viewport the stepper has to sit to count as already in view.
 *
 * The site navbar is a 64px `sticky top-0` band, so anything above that line is
 * behind it. The extra 32px is breathing room, and it is deliberately the same
 * number as the `scroll-mt-24` on the anchor — the threshold that decides
 * whether to scroll and the resting place it scrolls to have to agree, or a
 * step change lands just shy of the threshold and re-scrolls on the next one.
 */
const NAV_OFFSET_PX = 96;

/**
 * Which step a rejected launch rule belongs to, so we can jump the maker there.
 *
 * Partial because `ModerationCode` also covers rules only comments can break —
 * `moderateProduct` never returns those, and listing them here would claim a
 * launch step for something no launch can trip.
 */
const STEP_FOR_RULE: Partial<Record<ModerationCode, StepId>> = {
  adult_content: "main",
  fraudulent_content: "main",
  placeholder_name: "main",
  low_quality: "main",
  spam_formatting: "main",
  missing_link: "links",
  untrusted_link: "links",
};

export type ExistingProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricing_type: string;
  website_url: string | null;
  github_url: string | null;
  video_url: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
  tags: string[] | null;
  // Phase 2 launch fields
  cta_text: string | null;
  cta_url: string | null;
  platform_links: Json;
  tech_stack: string[] | null;
  coupon_code: string | null;
  offer_description: string | null;
  offer_expires_at: string | null;
  roadmap_url: string | null;
  changelog_url: string | null;
  available_for_hire: boolean | null;
  hire_pitch: string | null;
  launch_state: string | null;
};

/** Squeeze a long meta description down to a one-line tagline. */
function toTagline(description: string, max = 120): string {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** ["a","b","c"] → "a, b and c" */
function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Comma-separated input → trimmed, non-empty entries. */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type ProductFormProps = {
  product?: ExistingProduct;
  /**
   * State inferred from the request's IP (see lib/request-geo.ts), used only to
   * preselect the launch-location field on a new launch. Null in dev and for
   * requests Vercel can't place.
   */
  detectedState?: string | null;
};

export function ProductForm({ product, detectedState = null }: ProductFormProps) {
  const action = product
    ? updateProduct.bind(null, product.id, product.slug)
    : createProduct;
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );

  // Text fields
  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    pricingType: product?.pricing_type ?? "free",
    websiteUrl: product?.website_url ?? "",
    githubUrl: product?.github_url ?? "",
    videoUrl: product?.video_url ?? "",
    heroImageUrl: product?.hero_image_url ?? "",
    tags: product?.tags?.join(", ") ?? "",
    // Phase 2 launch fields
    ctaText: product?.cta_text ?? "",
    ctaUrl: product?.cta_url ?? "",
    techStack: product?.tech_stack?.join(", ") ?? "",
    couponCode: product?.coupon_code ?? "",
    offerDescription: product?.offer_description ?? "",
    offerExpiresAt: product?.offer_expires_at ? product.offer_expires_at.slice(0, 10) : "",
    roadmapUrl: product?.roadmap_url ?? "",
    changelogUrl: product?.changelog_url ?? "",
    hirePitch: product?.hire_pitch ?? "",
    // On an edit the maker's saved answer wins; only a new launch is prefilled
    // from geo-IP, and even then it's just a default they can change.
    launchState: product ? (product.launch_state ?? "") : (detectedState ?? ""),
  });

  // Multi-platform availability matrix + hire toggle (non-string state)
  const [platformLinks, setPlatformLinks] = useState<Record<string, string>>(
    () => (product?.platform_links as Record<string, string> | null) ?? {},
  );
  const [availableForHire, setAvailableForHire] = useState(product?.available_for_hire ?? false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Hero image (upload / paste / imported logo)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.hero_image_url ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Gallery images (screenshot_urls)
  const [gallery, setGallery] = useState<string[]>(product?.screenshot_urls ?? []);
  const updateGalleryItem = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setGallery((prev) => prev.map((url, i) => (i === index ? e.target.value : url)));
  const removeGalleryItem = (index: number) => () =>
    setGallery((prev) => prev.filter((_, i) => i !== index));
  const addGalleryItem = () =>
    setGallery((prev) => (prev.length >= MAX_GALLERY_IMAGES ? prev : [...prev, ""]));

  const [galleryUploading, setGalleryUploading] = useState(0);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryDragActive, setGalleryDragActive] = useState(false);

  /**
   * Uploads dropped/selected screenshots straight to Cloudinary and drops the
   * resulting URLs into the gallery rows, filling any blank row before adding
   * a new one. Files are uploaded at full resolution and rejected if they are
   * too small to render sharply -- see MIN_GALLERY_IMAGE_WIDTH.
   */
  const addGalleryFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setGalleryError(null);

    const used = gallery.filter(Boolean).length;
    const room = MAX_GALLERY_IMAGES - used;
    if (room <= 0) {
      setGalleryError(`You can add up to ${MAX_GALLERY_IMAGES} images.`);
      return;
    }

    const chosen = files.slice(0, room);
    const failures: string[] = [];

    setGalleryUploading((count) => count + chosen.length);
    for (const file of chosen) {
      try {
        const url = await uploadProductImage(file, { minWidth: MIN_GALLERY_IMAGE_WIDTH });
        setGallery((prev) => {
          const next = [...prev];
          const blank = next.findIndex((value) => !value);
          if (blank === -1) next.push(url);
          else next[blank] = url;
          return next;
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `Couldn't upload ${file.name}.`);
      } finally {
        setGalleryUploading((count) => count - 1);
      }
    }

    if (chosen.length < files.length) {
      failures.push(`Only ${room} more image${room === 1 ? "" : "s"} would fit.`);
    }
    setGalleryError(failures.length > 0 ? failures.join(" ") : null);
  };

  const handleGalleryDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setGalleryDragActive(true);
    else if (e.type === "dragleave") setGalleryDragActive(false);
  };

  const handleGalleryDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setGalleryDragActive(false);
    void addGalleryFiles(Array.from(e.dataTransfer.files));
  };

  // Import from URL
  const [importUrl, setImportUrl] = useState(product?.website_url ?? "");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{
    type: "error" | "success" | "warning";
    text: string;
  } | null>(
    null,
  );

  // Stepper
  const [step, setStep] = useState<StepId>("main");
  const [stepError, setStepError] = useState<string | null>(null);
  // Launch-rule failure caught before we hit the server (same rules, same module).
  const [ruleError, setRuleError] = useState<string | null>(null);

  /*
   * Publishing is four phases, not one: local validation, a Cloudinary upload,
   * the server action, then the navigation to the new product page. The
   * `pending` flag from `useActionState` only covers the third — so the button
   * used to re-enable in the gaps, and, worse, went back to reading "Publish
   * product" the moment the action returned, while the redirect it triggered
   * was still in flight. That is the slowest phase and the one that most looks
   * like nothing happened, which is exactly when a maker clicks again.
   *
   * The lock holds whichever action result was current when the maker clicked,
   * and the submit counts as live until the result moves on from it. A rejected
   * launch returns a brand-new `{ error }` object, so it releases the lock by
   * itself; a successful one never returns at all, so the indicator stays up
   * through the redirect. Comparing results this way keeps it to one render —
   * clearing a boolean from an effect would cost a second pass.
   */
  const [submitLock, setSubmitLock] = useState<{ result: ProductFormState } | null>(null);
  const submitting = submitLock !== null && submitLock.result === state;

  /*
   * The lock above has one failure mode, and it is the worst one: it opens only
   * when something *arrives*. A launch that never comes back — a killed
   * function, a dropped connection, a response the router can't read as an
   * action result — leaves `submitting` (or `pending`) latched on with no error
   * to show and no result to compare against, and the overlay below covers the
   * whole viewport. The maker is then left looking at a spinner that cannot
   * end, over a form they cannot reach, with no way to retry and nothing said.
   *
   * So the wait is bounded. Past the deadline we stop claiming to know what is
   * happening: uncover the page, release the lock, and say plainly that the
   * launch may or may not have been recorded and where to check. Being wrong
   * about a slow-but-fine launch costs a duplicate-name message on retry; being
   * wrong the other way costs the maker the whole submission.
   */
  const [stall, setStall] = useState<{ result: ProductFormState } | null>(null);
  // Same idiom as the lock above, and for the same reason: a verdict that turns
  // up late is a better answer than "we don't know", so the notice stands only
  // until the action result moves on from the one it was raised against.
  const stalled = stall !== null && stall.result === state;

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  const productLinks = [
    formData.websiteUrl,
    formData.githubUrl,
    formData.ctaUrl,
    ...Object.values(platformLinks),
  ];
  const hasProductLink = productLinks.some((link) => link.trim());

  /** Blocks Next when a step is missing something the launch can't go without. */
  // Whatever the form is currently complaining about, in priority order.
  const activeError = ruleError ?? state?.error ?? stepError ?? null;
  const errorRef = useRef<HTMLDivElement>(null);
  /** Top of the stepper — where a step change scrolls back to. See `goToStep`. */
  const topRef = useRef<HTMLDivElement>(null);

  // The banner lives below the step panels, so bring it into view whenever it
  // changes — otherwise a rejected publish just silently scrolls away.
  useEffect(() => {
    if (activeError || stalled) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeError, stalled]);

  /** The submit is in flight — covers the action *and* the redirect after it. */
  const inFlight = submitting || pending || uploadingImage || galleryUploading > 0;

  /*
   * Starts the clock on whichever phase is running, and restarts it when the
   * phase changes — a slow Cloudinary upload followed by a slow action gets a
   * full allowance each rather than sharing one.
   *
   * Releasing the lock here is what actually unsticks the form: `submitting`
   * only clears when a *different* action result arrives, and `pending` clears
   * only when React's action settles. Neither can be waited on if the response
   * never comes, so the lock is dropped from this side instead. `pending` may
   * well stay true underneath, which is why every gate below reads `!stalled`
   * rather than trusting the flags on their own.
   */
  useEffect(() => {
    // Already given up on this one: `pending` can stay latched behind a response
    // that never came, and re-arming against it would just retell the maker the
    // same thing every 25 seconds. The next submit starts the next clock.
    if (!inFlight || stalled) return;
    const timer = setTimeout(() => {
      setSubmitLock(null);
      setStall({ result: state });
    }, PUBLISH_STALL_MS);
    return () => clearTimeout(timer);
  }, [inFlight, stalled, uploadingImage, galleryUploading, state]);

  /** Whether to cover the page and say a launch is running. */
  const publishing = (submitting || pending) && !stalled;
  /** Anything that must block a second submit, uploads included. */
  const busy = inFlight && !stalled;
  // Only the hero upload can run inside a submit — a gallery upload in flight
  // makes the form `busy`, which turns the submit away before it starts.
  const busyLabel = uploadingImage
    ? "Uploading your image…"
    : product
      ? "Saving your changes…"
      : "Publishing your launch…";

  function validateStep(id: StepId): string | null {
    if (id === "main") {
      if (!formData.name.trim()) return "Add your product's name.";
      // The input's maxLength only constrains typing. Import-from-URL writes
      // this field programmatically, which maxLength does not police, so an
      // over-long name used to sail past every client check and come back as a
      // server error on the review step -- with nothing pointing at the field.
      if (formData.name.trim().length > MAX_NAME_LENGTH) {
        return `Shorten the name to ${MAX_NAME_LENGTH} characters or fewer.`;
      }
      if (!formData.tagline.trim()) return "Add a tagline so people know what it does.";
      if (!formData.category) return "Choose a category.";
    }
    if (id === "links" && !hasProductLink) {
      return "Add at least one link — a website, GitHub repo, or app store listing.";
    }
    return null;
  }

  /** Sidebar tick: required steps when satisfied, optional ones when filled in. */
  function isStepComplete(id: StepId): boolean {
    switch (id) {
      case "main":
        return Boolean(formData.name.trim() && formData.tagline.trim() && formData.category);
      case "media":
        return Boolean(imagePreview || formData.heroImageUrl.trim() || gallery.some(Boolean));
      case "links":
        return hasProductLink;
      case "extras":
        return Boolean(formData.tags.trim() || formData.techStack.trim() || formData.ctaText.trim());
      default:
        return false;
    }
  }

  /**
   * Moves to a step and puts the top of the new panel back in view.
   *
   * Not `window.scrollTo(0)`: above the form sit the page heading and the
   * launch counter, and re-reading those between every step is wasted travel.
   * The anchor is the top of the stepper itself, so a maker lands on the first
   * field of the step they just opened with the nav still on screen.
   *
   * And only when it is actually off screen. Switching steps from the top of
   * the page — which is where a maker is after any jump — would otherwise
   * scroll *down* to the anchor, moving the page for no reason.
   *
   * `scroll: false` is for jumps caused by an error: the error banner sits
   * below the panels, so scrolling to the top would carry it off-screen and
   * the click would look like it did nothing. Those jumps let the effect above
   * scroll the banner into view instead.
   */
  function goToStep(next: StepId, { scroll = true }: { scroll?: boolean } = {}) {
    setStep(next);
    if (scroll) {
      setStepError(null);
      const top = topRef.current;
      // `>= NAV_OFFSET_PX` means the anchor is already clear of the sticky
      // navbar, so the maker can see where the step begins without moving.
      if (top && top.getBoundingClientRect().top < NAV_OFFSET_PX) {
        top.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function handleNext() {
    const problem = validateStep(step);
    if (problem) {
      setStepError(problem);
      return;
    }
    goToStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id);
  }

  function handleBack() {
    goToStep(STEPS[Math.max(stepIndex - 1, 0)].id);
  }

  async function handleImport() {
    const url = importUrl.trim();
    if (!url) {
      setImportMsg({ type: "error", text: "Paste your product's URL first." });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const result = await fetchUrlMetadata(url);
      if (!result.ok) {
        setImportMsg({ type: "error", text: result.error });
        return;
      }
      const data = result.data;
      setFormData((prev) => ({
        ...prev,
        name: data.name || prev.name,
        tagline: data.tagline ? toTagline(data.tagline) : prev.tagline,
        description: data.description || prev.description,
        // Only a guess — never overwrite a category the maker already picked.
        category: prev.category || data.category || "",
        websiteUrl: data.url || url,
        heroImageUrl: data.icon || prev.heroImageUrl,
      }));
      if (data.icon) {
        setImageFile(null);
        setImagePreview(data.icon);
      }
      setGallery((prev) => {
        const merged = [...prev];
        for (const image of data.images) {
          if (image && !merged.includes(image)) merged.push(image);
        }
        return merged.slice(0, 8);
      });
      // A `notice` means the page couldn't be read at all and we fell back to
      // the URL and domain favicon — real information, so don't dress it up as
      // a clean success.
      if (result.notice) {
        setImportMsg({ type: "warning", text: result.notice });
        return;
      }

      // Name what the page didn't publish. Single-page apps very often ship a
      // <title> and nothing else, and "Details imported" over three still-empty
      // fields reads like the importer failed silently.
      const missing = [
        !data.tagline && "tagline",
        !data.description && "description",
        !data.icon && "logo",
        !data.category && "category",
      ].filter((label): label is string => Boolean(label));

      // A logo can be present and still be unusable. Plenty of sites publish
      // nothing but a 16 or 32px favicon — paytm.com is one — and blowing that
      // up to a 200px avatar is where the blur comes from. Say so rather than
      // letting the maker discover it on their live product page.
      if (data.icon && data.iconPixels !== null && data.iconPixels < MIN_LOGO_PIXELS) {
        setImportMsg({
          type: "warning",
          text:
            `That site only publishes a ${data.iconPixels}px logo, which will look blurry. ` +
            `Upload a square image at least ${MIN_LOGO_PIXELS}px wide instead.`,
        });
        return;
      }

      setImportMsg(
        missing.length === 0
          ? { type: "success", text: "Details imported — review and edit below." }
          : {
              type: "warning",
              text: `Imported what that page publishes. It doesn't list a ${formatList(missing)} — add ${missing.length > 1 ? "those" : "that"} below.`,
            },
      );
    } catch {
      setImportMsg({ type: "error", text: "Couldn't fetch that page. Fill the form in manually." });
    } finally {
      setImporting(false);
    }
  }

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`Image must be smaller than ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`);
      return;
    }
    setImageFile(file);
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadError(null);
    setFormData((prev) => ({ ...prev, heroImageUrl: "" }));
  };

  const handleFormSubmit = async (submitData: FormData) => {
    // A second submit while the first is still running would publish the
    // product twice. The button is disabled and the overlay is up, but Enter on
    // the review step reaches this handler regardless of both.
    if (busy) return;
    setSubmitLock({ result: state });
    // A retry after a stalled launch starts a fresh attempt, and a fresh clock.
    setStall(null);

    // Required fields live on specific steps, and the stepper lets a maker jump
    // straight to Review. Check them here so an incomplete form points at the
    // field to fix instead of bouncing off the server with a generic message.
    for (const id of REQUIRED_STEPS) {
      const problem = validateStep(id);
      if (problem) {
        setRuleError(null);
        setStepError(problem);
        goToStep(id, { scroll: false });
        setSubmitLock(null);
        return;
      }
    }
    setStepError(null);

    // Check the launch rules before uploading anything — the server re-runs the
    // exact same check, this just saves a rejected round trip.
    const check = moderateProduct({
      name: formData.name,
      tagline: formData.tagline,
      description: formData.description,
      tags: splitList(formData.tags),
      techStack: splitList(formData.techStack),
      websiteUrl: formData.websiteUrl,
      githubUrl: formData.githubUrl,
      videoUrl: formData.videoUrl,
      ctaText: formData.ctaText,
      ctaUrl: formData.ctaUrl,
      platformLinks,
      couponCode: formData.couponCode,
      offerDescription: formData.offerDescription,
      hirePitch: availableForHire ? formData.hirePitch : null,
      heroImageUrl: imageFile ? null : formData.heroImageUrl,
      screenshotUrls: gallery.filter(Boolean),
    });
    if (!check.ok) {
      setRuleError(check.message);
      // Send them to the step that actually holds the problem — without
      // scrolling to the top, so the reason stays on screen.
      goToStep(STEP_FOR_RULE[check.code] ?? "main", { scroll: false });
      setSubmitLock(null);
      return;
    }
    setRuleError(null);

    if (imageFile) {
      setUploadingImage(true);
      try {
        const uploadedUrl = await uploadProductImage(imageFile);
        submitData.set("heroImageUrl", uploadedUrl);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Failed to upload image");
        setUploadingImage(false);
        setSubmitLock(null);
        return;
      }
      setUploadingImage(false);
    }
    // `submitting` stays set from here: it now hands off to `pending`, and then
    // covers the redirect that `pending` does not.
    formAction(submitData);
  };

  const previewData = {
    name: formData.name || "Product Name",
    tagline: formData.tagline || "Your product tagline goes here",
    category: formData.category || "Category",
    pricingType: formData.pricingType || "free",
    imageUrl: imagePreview,
  };

  const panel = (id: StepId) => cn("flex-col gap-6", step === id ? "flex" : "hidden");
  const card = "space-y-4 rounded-xl border border-border bg-card p-6";

  const nextStep = STEPS[stepIndex + 1] ?? null;

  return (
    /*
     * `scroll-mt-24` is the resting offset for the step-change scroll in
     * `goToStep` — it clears the 64px sticky navbar so the nav and the first
     * field of the new step both land on screen. Paired with `NAV_OFFSET_PX`.
     */
    <div ref={topRef} className="grid scroll-mt-24 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/*
        A launch is a handful of round trips even at its fastest, and the
        redirect at the end is the slowest part of it. This makes the wait
        visible and — because it sits over the whole viewport — makes a second
        click physically impossible rather than merely discouraged.

        The spinner is decorative: the global prefers-reduced-motion rule in
        globals.css freezes it, so the label is what actually carries the news.
      */}
      {publishing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dark/70 p-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-7 text-center shadow-xl">
            <Loader2 size={28} className="animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">{busyLabel}</p>
            <p className="text-xs text-muted">
              {product
                ? "Saving your product — this only takes a moment."
                : "Setting up your product page — this only takes a moment."}
            </p>
          </div>
        </div>
      )}

      {/*
        Step nav — a sidebar on desktop, a scrollable chip row on mobile.

        `min-w-0` is what makes the mobile half of that sentence true. A grid
        item defaults to `min-width: auto`, which resolves to its content's
        minimum size, so this column grew to fit all five nowrap chips laid end
        to end -- 703px of column inside a 375px phone. The `overflow-x-auto` on
        the <ol> below never engaged, because nothing was ever forcing it to:
        the nav had all the room it asked for, and the *page* did the scrolling
        instead. That is what pushed the form card off screen.

        Measured at 375px: 703px document width before, 375px after, with the
        chip row becoming genuinely scrollable only once this was added.
      */}
      <nav aria-label="Launch steps" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {STEPS.map((entry, index) => {
            const Icon = entry.icon;
            const isActive = entry.id === step;
            const isDone = isStepComplete(entry.id);
            return (
              <li key={entry.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => goToStep(entry.id)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-secondary-bg font-semibold text-ink"
                      : "text-body hover:bg-secondary-bg/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary-bg text-muted",
                    )}
                  >
                    {isDone ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                  </span>
                  <span className="whitespace-nowrap lg:whitespace-normal">{entry.label}</span>
                  <span className="ml-auto hidden text-xs text-muted lg:inline">{index + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        action={handleFormSubmit}
        aria-busy={publishing}
        // Every panel is mounted but hidden with `display:none`, and the browser
        // refuses to *report* a validation failure on a control it can't focus —
        // it just aborts the submit and logs "An invalid form control ... is not
        // focusable" to the console. A half-typed `type="url"` field four steps
        // back was therefore enough to make Publish look dead with no error at
        // all. Validation is ours to do: `validateStep` gates the steps,
        // `moderateProduct` runs before submit, and the server re-checks
        // everything including URL shape.
        noValidate
        // Every panel is mounted, so a stray Enter in a field on step 1 would
        // otherwise publish the whole form. Only the review step may submit
        // that way.
        //
        // The exemptions are not cosmetic. A button's click is generated *from*
        // this keydown's default action, so blocking Enter everywhere also made
        // Enter dead on every control in the form — Import, Upload, Remove, the
        // platform-link toggles — for anyone driving it from the keyboard. Same
        // for a link, and for the choice a <select> commits with Enter. Enter
        // is only taken away where it has no job but to submit.
        onKeyDown={(event) => {
          if (event.key !== "Enter" || step === "review") return;
          const tag = (event.target as HTMLElement).tagName;
          if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SELECT") return;
          event.preventDefault();
        }}
        /*
         * `min-w-0`: the same `min-width: auto` trap documented on the nav
         * above. This column is well behaved today, but it holds every field on
         * the page, and one future unbreakable string -- a long URL echoed back
         * in an error, a pasted slug -- would silently widen the whole document
         * again. It is `minmax(0,1fr)` at `lg` already; this is the mobile half.
         */
        className="flex min-w-0 flex-col gap-6"
      >
        {/* ── Step 1: Main info ───────────────────────────────────── */}
        <div className={panel("main")}>
          {/* Launch rules — enforced server-side in lib/moderation.ts */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Launch rules</h2>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {SUBMISSION_RULES.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    •
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Import from URL — auto-fills the fields below, Product-Hunt style */}
          <div className="space-y-3 rounded-xl border border-border bg-secondary-bg/60 p-6">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Import from a URL</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste your product&apos;s link and we&apos;ll auto-fill the details for you.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                // Deliberately not type="url": `fetchUrlMetadata` normalises a
                // bare `example.com` for you, so browser URL validation would
                // only reject input that actually works.
                type="text"
                inputMode="url"
                autoComplete="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleImport();
                  }
                }}
                placeholder="https://yourproduct.com"
                aria-label="Product URL to import"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleImport()}
                disabled={importing}
                className="shrink-0"
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Fetching…
                  </>
                ) : (
                  "Fetch details"
                )}
              </Button>
            </div>
            {importMsg && (
              <p
                className={cn(
                  "text-xs",
                  importMsg.type === "error" && "text-destructive",
                  importMsg.type === "warning" && "text-warning",
                  importMsg.type === "success" && "text-success",
                )}
                role="status"
              >
                {importMsg.text}
              </p>
            )}
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                name="name"
                maxLength={MAX_NAME_LENGTH}
                value={formData.name}
                onChange={handleInputChange}
                placeholder="AI Code Reviewer"
              />
              <p className="text-xs text-muted-foreground">{formData.name.length}/{MAX_NAME_LENGTH}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tagline">Tagline *</Label>
              <Input
                id="tagline"
                name="tagline"
                maxLength={120}
                value={formData.tagline}
                onChange={handleInputChange}
                placeholder="Catch bugs before your teammates do"
              />
              <p className="text-xs text-muted-foreground">{formData.tagline.length}/120</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleInputChange}
                placeholder="What does it do? Who is it for? What problem does it solve?"
              />
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Category &amp; Pricing</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className={selectClassName}
                >
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pricingType">Pricing</Label>
                <select
                  id="pricingType"
                  name="pricingType"
                  value={formData.pricingType}
                  onChange={handleInputChange}
                  className={selectClassName}
                >
                  <option value="free">Free</option>
                  <option value="freemium">Freemium</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Optional and always the maker's call. On a new launch this starts
              on whatever the request's IP suggests, which is a guess — VPNs and
              mobile carriers routinely place people in the wrong state — so the
              copy says so and "Prefer not to say" is a real, reachable option
              rather than a disabled placeholder. */}
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Where are you building from?</h2>
            <p className="text-xs text-muted-foreground">
              Optional. Puts your launch on the India map on our homepage.
              {!product && detectedState
                ? " We've guessed this from your connection — change it if it's wrong."
                : ""}
            </p>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="launchState">State or union territory</Label>
              <select
                id="launchState"
                name="launchState"
                value={formData.launchState}
                onChange={handleInputChange}
                className={selectClassName}
              >
                <option value="">Prefer not to say</option>
                <optgroup label="States">
                  {INDIA_STATES.filter((entry) => entry.kind === "state").map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Union territories">
                  {INDIA_STATES.filter((entry) => entry.kind === "ut").map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        {/* ── Step 2: Images and media ────────────────────────────── */}
        <div className={panel("media")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Product Image</h2>
            <p className="text-xs text-muted-foreground">
              The square logo shown as your product&apos;s avatar.
            </p>

            {imagePreview && (
              <div className="relative w-full overflow-hidden rounded-lg border border-input bg-secondary-bg">
                {/* The uploaded file is a square logo, so show it whole. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Product preview"
                  className="h-48 w-full object-contain p-4"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 rounded-full bg-destructive p-1.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
                  aria-label="Remove image"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all",
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-secondary-bg",
                )}
              >
                <Upload
                  size={20}
                  className={cn(
                    "transition-colors",
                    isDragActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP up to 10MB</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  disabled={uploadingImage || busy}
                  className="hidden"
                />
              </label>

              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

              {imageFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
                </p>
              )}

              <div>
                <p className="mb-2 text-xs text-muted-foreground">Or paste an image URL:</p>
                <Input
                  id="heroImageUrl"
                  name="heroImageUrl"
                  type="url"
                  value={formData.heroImageUrl}
                  onChange={handleInputChange}
                  placeholder="https://…/logo.png"
                  disabled={!!imageFile}
                />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Gallery images</h2>
            <p className="text-xs text-muted-foreground">
              Screenshots and previews shown on your product page (up to {MAX_GALLERY_IMAGES}).
            </p>

            <label
              onDragEnter={handleGalleryDrag}
              onDragLeave={handleGalleryDrag}
              onDragOver={handleGalleryDrag}
              onDrop={handleGalleryDrop}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all",
                galleryDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary-bg",
              )}
            >
              <Upload
                size={20}
                className={cn(
                  "transition-colors",
                  galleryDragActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {galleryUploading > 0
                    ? `Uploading ${galleryUploading} image${galleryUploading === 1 ? "" : "s"}…`
                    : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WebP up to {MAX_UPLOAD_BYTES / 1024 / 1024}MB · at least{" "}
                  {MIN_GALLERY_IMAGE_WIDTH}px wide, so it stays sharp
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  // Copy the FileList before clearing the input, which empties
                  // it -- and clear it so the same file can be retried after a
                  // rejected upload.
                  void addGalleryFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
                disabled={galleryUploading > 0 || busy}
                className="hidden"
              />
            </label>

            {galleryError && <p className="text-sm text-destructive">{galleryError}</p>}

            {gallery.length > 0 && (
              <p className="text-xs text-muted-foreground">Or paste image URLs:</p>
            )}

            <div className="flex flex-col gap-2">
              {gallery.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="aspect-video h-11 shrink-0 rounded-md border border-border bg-secondary-bg object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <span className="aspect-video h-11 shrink-0 rounded-md border border-dashed border-border" />
                  )}
                  <Input
                    name="screenshotUrls"
                    type="url"
                    value={url}
                    onChange={updateGalleryItem(index)}
                    placeholder="https://…/screenshot.png"
                    aria-label={`Gallery image ${index + 1}`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={removeGalleryItem(index)}
                    aria-label="Remove image"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X size={16} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addGalleryItem}
                disabled={gallery.length >= MAX_GALLERY_IMAGES}
                className="self-start"
              >
                <Plus size={16} /> Add image URL
              </Button>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Demo video</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="videoUrl">Demo video URL</Label>
              <Input
                id="videoUrl"
                name="videoUrl"
                type="url"
                value={formData.videoUrl}
                onChange={handleInputChange}
                placeholder="YouTube, Loom, or Vimeo link"
              />
              <p className="text-xs text-muted-foreground">
                Shown as an embedded player on your product page.
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 3: Links ───────────────────────────────────────── */}
        <div className={panel("links")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Links</h2>
            <p className="text-xs text-muted-foreground">
              At least one link is required — it&apos;s how people (and we) verify the product is
              real.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                type="url"
                value={formData.websiteUrl}
                onChange={handleInputChange}
                placeholder="https://example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="githubUrl">GitHub URL</Label>
              <Input
                id="githubUrl"
                name="githubUrl"
                type="url"
                value={formData.githubUrl}
                onChange={handleInputChange}
                placeholder="https://github.com/you/repo"
              />
            </div>
          </div>

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Where to get it</h2>
              <p className="text-xs text-muted-foreground">
                Add the platforms your product is available on (optional).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRODUCT_PLATFORMS.map((platform) => (
                <div key={platform.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`platform_${platform.key}`}>{platform.label}</Label>
                  <Input
                    id={`platform_${platform.key}`}
                    name={`platform_${platform.key}`}
                    type="url"
                    value={platformLinks[platform.key] ?? ""}
                    onChange={(e) =>
                      setPlatformLinks((prev) => ({ ...prev, [platform.key]: e.target.value }))
                    }
                    placeholder={platform.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Primary call-to-action</h2>
              <p className="text-xs text-muted-foreground">
                The main button visitors see on your launch page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ctaText">Button text</Label>
                <Input
                  id="ctaText"
                  name="ctaText"
                  maxLength={40}
                  value={formData.ctaText}
                  onChange={handleInputChange}
                  placeholder="Claim Lifetime Deal"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ctaUrl">Button link</Label>
                <Input
                  id="ctaUrl"
                  name="ctaUrl"
                  type="url"
                  value={formData.ctaUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourproduct.com/get"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 4: Extras ──────────────────────────────────────── */}
        <div className={panel("extras")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Tags</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
                placeholder="ai, devtools, productivity (up to 5, comma separated)"
              />
              <p className="text-xs text-muted-foreground">
                {splitList(formData.tags).length}/5 tags
              </p>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Tech stack</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="techStack">Built with</Label>
              <Input
                id="techStack"
                name="techStack"
                value={formData.techStack}
                onChange={handleInputChange}
                placeholder="Next.js, Supabase, OpenAI (comma separated)"
              />
              <p className="text-xs text-muted-foreground">Up to 12, comma separated.</p>
            </div>
          </div>

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Launch offer</h2>
              <p className="text-xs text-muted-foreground">
                Optional promo shown in a highlighted box on your page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="couponCode">Coupon code</Label>
                <Input
                  id="couponCode"
                  name="couponCode"
                  maxLength={40}
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  placeholder="LAUNCH50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offerExpiresAt">Expires</Label>
                <Input
                  id="offerExpiresAt"
                  name="offerExpiresAt"
                  type="date"
                  value={formData.offerExpiresAt}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offerDescription">Offer details</Label>
              <Input
                id="offerDescription"
                name="offerDescription"
                maxLength={200}
                value={formData.offerDescription}
                onChange={handleInputChange}
                placeholder="50% off the first year for Bharat Hunt users"
              />
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Roadmap &amp; changelog</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="roadmapUrl">Roadmap URL</Label>
                <Input
                  id="roadmapUrl"
                  name="roadmapUrl"
                  type="url"
                  value={formData.roadmapUrl}
                  onChange={handleInputChange}
                  placeholder="https://…/roadmap"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="changelogUrl">Changelog URL</Label>
                <Input
                  id="changelogUrl"
                  name="changelogUrl"
                  type="url"
                  value={formData.changelogUrl}
                  onChange={handleInputChange}
                  placeholder="https://…/changelog"
                />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Available for services</h2>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                name="availableForHire"
                checked={availableForHire}
                onChange={(e) => setAvailableForHire(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">
                Show a &ldquo;Hire us&rdquo; badge on my product page
              </span>
            </label>
            {availableForHire && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hirePitch">Services pitch</Label>
                <Textarea
                  id="hirePitch"
                  name="hirePitch"
                  rows={2}
                  maxLength={300}
                  value={formData.hirePitch}
                  onChange={handleInputChange}
                  placeholder="We build AI products for startups — available for consulting."
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Step 5: Review and launch ───────────────────────────── */}
        <div className={panel("review")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">How your card will look</h2>
            <div className="max-w-sm space-y-3 rounded-xl border border-border bg-background p-4">
              <ProductLogo src={previewData.imageUrl} name={previewData.name} size="md" />

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                    {previewData.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {
                      PRICING_TYPE_LABELS[
                        previewData.pricingType as keyof typeof PRICING_TYPE_LABELS
                      ]
                    }
                  </span>
                </div>

                <p className="line-clamp-2 text-xs text-body">{previewData.tagline}</p>

                <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted">
                  <span className="rounded-full bg-secondary-bg px-2 py-0.5">
                    {previewData.category}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Launch checklist</h2>
            <ul className="flex flex-col gap-2.5 text-sm">
              {STEPS.filter((entry) => entry.id !== "review").map((entry) => {
                const done = isStepComplete(entry.id);
                const optional = entry.id === "media" || entry.id === "extras";
                return (
                  <li key={entry.id} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full",
                        done ? "bg-primary text-primary-foreground" : "bg-secondary-bg text-muted",
                      )}
                    >
                      {done ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
                    </span>
                    <span className={done ? "text-body" : "text-muted"}>{entry.label}</span>
                    {!done && (
                      <>
                        <span className="text-xs text-muted">
                          {optional ? "(optional)" : "(required)"}
                        </span>
                        <button
                          type="button"
                          onClick={() => goToStep(entry.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Add
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Scroll target for whichever banner is showing — see the effect above. */}
        <div ref={errorRef} className="empty:hidden">
          {/*
            The form is usable again at this point, so this has to say the one
            thing that stops a maker making it worse: we don't know whether it
            landed, and a blind retry of a launch that did land comes back as a
            duplicate. The link is a plain <a> on purpose — whatever left the
            submit hanging may well be the client router itself, and a full page
            load is the one navigation that cannot also be stuck.
          */}
          {stalled && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert">
              <p className="text-sm font-semibold text-amber-900">
                {product
                  ? "Your changes are taking longer than expected."
                  : "Your launch is taking longer than expected."}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {product ? (
                  "The save may still have gone through — reload this page to see where it got to before saving again."
                ) : (
                  <>
                    It may still have gone through. Check{" "}
                    <a href="/dashboard" className="font-medium underline">
                      your dashboard
                    </a>{" "}
                    before submitting again — resubmitting a launch that already arrived comes back
                    as a duplicate.
                  </>
                )}
              </p>
            </div>
          )}

          {stepError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert">
              <p className="text-sm text-amber-800">{stepError}</p>
            </div>
          )}

          {(ruleError || state?.error) && (
            <div
              className="rounded-lg border border-destructive/50 bg-destructive/10 p-4"
              role="alert"
            >
              <p className="text-sm text-destructive">{ruleError ?? state?.error}</p>
            </div>
          )}
        </div>

        {/* Step controls */}
        {/*
          Sticky, not static. Every panel above is a screen or more of fields —
          "Main info" alone is name, tagline, description, category, pricing and
          state — so Next sat below the fold on every step, and reaching it
          meant scrolling back past fields the maker had just filled in. The
          review step was the worst of it: Submit sat under the card preview and
          the checklist, which is exactly where someone who has already decided
          to launch stops reading.

          `bottom-4` floats it clear of the viewport edge so it reads as a
          toolbar over the form rather than browser chrome, and it settles into
          its natural place at the end of the form, where there is nothing left
          below it to cover. `z-30` sits under the navbar (z-40) and under the
          publishing overlay (z-50), which has to cover everything.

          `flex-wrap` because these controls cannot shrink: Button is
          `shrink-0 whitespace-nowrap` by design, so Back + "Step n of 5" +
          Next + Save changes is a fixed 379px of row. On the edit form, where
          Save sits alongside Next on every step, that overflowed a 375px phone
          by 4px and a 320px one by 59px. Wrapping only engages when the row
          genuinely does not fit, so the desktop layout is unchanged.
        */}
        <div className="sticky bottom-4 z-30 overflow-hidden rounded-xl border border-border bg-card/95 shadow-soft backdrop-blur-md">
          {/*
            The sidebar says which step you are on; this says how much of the
            launch is left. Decorative — "Step n of 5" below carries the same
            fact in text.
          */}
          <div className="h-1 w-full bg-secondary-bg" aria-hidden="true">
            <div
              className="h-full rounded-r-full transition-[width] duration-300 ease-out"
              style={{
                width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
                backgroundImage: "var(--gradient-primary)",
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className={cn(stepIndex === 0 && "invisible")}
            >
              <ChevronLeft size={16} /> Back
            </Button>

            {/*
              `min-w-0` + `truncate` so the "up next" hint gives way rather than
              widening the bar past its column. Only one of the two counts is
              ever displayed, so a screen reader reads the long form and not
              both.
            */}
            <span className="min-w-0 truncate text-xs text-muted">
              <span className="sm:hidden">
                {stepIndex + 1}/{STEPS.length}
              </span>
              <span className="hidden sm:inline">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              {/* Naming the next step makes the form feel finite rather than
                  endless — you can see it is nearly over. */}
              {nextStep && <span className="hidden md:inline"> · Up next: {nextStep.label}</span>}
            </span>

            {/* When editing, the fields are already filled — let them save from
                any step instead of clicking through to the end. */}
            <div className="flex items-center gap-2">
              {step !== "review" && (
                <Button type="button" variant={product ? "outline" : "default"} onClick={handleNext}>
                  Next <ChevronRight size={16} />
                </Button>
              )}
              {(step === "review" || product) && (
                <Button type="submit" disabled={busy} size="lg" aria-busy={busy}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      {uploadingImage || galleryUploading > 0
                        ? "Uploading image…"
                        : product
                          ? "Saving…"
                          : "Submitting…"}
                    </>
                  ) : product ? (
                    "Save changes"
                  ) : (
                    // Not "Publish": the maker submits, a reviewer publishes.
                    "Submit for review"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
