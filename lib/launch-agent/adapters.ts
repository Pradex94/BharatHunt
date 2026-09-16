/**
 * Platform adapters: the one place platform-specific behaviour lives.
 *
 * Every platform resolves to an adapter by its registry `adapter` key, falling
 * back to the adapter for its automation level. Adding a platform is a registry
 * row; adding a platform with special behaviour is one adapter here. Nothing
 * else in the app branches on a platform's slug.
 *
 * Not every adapter implements every method. `submit` exists only where an
 * approved API permits it — today, nowhere (see the seed notes in
 * 20260915000000_launch_agent.sql). `AutomatedAdapter` is the contract a future
 * integration fills in; until one is configured it fails loudly and honestly
 * rather than pretending a submission happened.
 *
 * Adapters never hold credentials and never store passwords. An integration
 * that needs OAuth tokens will get its own server-only storage when one exists.
 */

import { checkRequirements, readinessOf } from "./requirements.ts";
import { preparedStatus } from "./status.ts";
import { stripUtm } from "./utm.ts";
import type { LaunchKit, LaunchPlatform, LaunchProduct, PlatformCampaignStatus, RequirementCheck } from "./types.ts";

export type PreparedSubmission = {
  checks: RequirementCheck[];
  readiness: number;
  status: PlatformCampaignStatus;
  /** Where "Open submission" goes: the official form, pre-filled when the platform supports it. */
  submissionUrl: string | null;
  /** Shown beside the button. */
  handoffMessage: string;
};

export type SubmitResult =
  | { ok: true; status: "SUBMITTED" | "PUBLISHED"; publishedUrl?: string | null }
  | { ok: false; status: "FAILED" | "USER_ACTION_REQUIRED"; error: string };

export interface LaunchPlatformAdapter {
  readonly key: string;
  checkRequirements(platform: LaunchPlatform, product: LaunchProduct, kit: LaunchKit | null, hasScheduledDate: boolean): RequirementCheck[];
  prepareSubmission(platform: LaunchPlatform, product: LaunchProduct, kit: LaunchKit, context: { utmUrl: string; hasScheduledDate: boolean }): PreparedSubmission;
  /** Only on adapters backed by an approved API. */
  submit?(platform: LaunchPlatform, product: LaunchProduct, kit: LaunchKit): Promise<SubmitResult>;
  getStatus?(platform: LaunchPlatform, externalId: string): Promise<PlatformCampaignStatus>;
  getPublishedUrl?(platform: LaunchPlatform, externalId: string): Promise<string | null>;
}

export const HANDOFF_MESSAGE =
  "We've prepared everything. Final submission requires you to complete it on the platform.";

/** AI_PREPARED: generates the package; the maker submits by hand. */
class PreparedAdapter implements LaunchPlatformAdapter {
  readonly key: string = "prepared";

  checkRequirements(platform: LaunchPlatform, product: LaunchProduct, kit: LaunchKit | null, hasScheduledDate: boolean) {
    return checkRequirements(platform, product, kit, { hasScheduledDate });
  }

  protected submissionUrlFor(platform: LaunchPlatform, kit: LaunchKit, utmUrl: string): string | null {
    // The plain official form; subclasses that can pre-fill it use `kit` and `utmUrl`.
    void kit;
    void utmUrl;
    return platform.submissionUrl ?? platform.websiteUrl;
  }

  prepareSubmission(platform: LaunchPlatform, product: LaunchProduct, kit: LaunchKit, context: { utmUrl: string; hasScheduledDate: boolean }): PreparedSubmission {
    const checks = this.checkRequirements(platform, product, kit, context.hasScheduledDate);
    return {
      checks,
      readiness: readinessOf(checks, true),
      status: preparedStatus(platform.automationLevel, checks),
      submissionUrl: this.submissionUrlFor(platform, kit, context.utmUrl),
      handoffMessage: HANDOFF_MESSAGE,
    };
  }
}

/** ASSISTED: same package, plus the official form opened for the maker. */
class AssistedAdapter extends PreparedAdapter {
  readonly key: string = "assisted";
}

/**
 * Hacker News's own bookmarklet endpoint takes `u` and `t`, so the form opens
 * pre-filled. The maker still reviews and presses submit themselves.
 */
class ShowHnAdapter extends AssistedAdapter {
  readonly key = "show-hn";
  protected submissionUrlFor(platform: LaunchPlatform, kit: LaunchKit, utmUrl: string): string | null {
    const base = platform.submissionUrl ?? "https://news.ycombinator.com/submitlink";
    try {
      const url = new URL(base);
      if (url.hostname !== "news.ycombinator.com") return base;
      url.pathname = "/submitlink";
      // HN shows the link as submitted, so give it the clean URL — HN readers
      // distrust tracking parameters, and HN referrals are identifiable anyway.
      url.searchParams.set("u", stripUtm(utmUrl));
      url.searchParams.set("t", kit.title);
      return url.toString();
    } catch {
      return base;
    }
  }
}

/** Reddit's submit page accepts `url` and `title`; the maker picks link vs text and posts. */
class RedditAdapter extends AssistedAdapter {
  readonly key = "reddit";
  protected submissionUrlFor(platform: LaunchPlatform, kit: LaunchKit, utmUrl: string): string | null {
    if (!platform.submissionUrl) return platform.websiteUrl;
    try {
      const url = new URL(platform.submissionUrl);
      if (!url.hostname.endsWith("reddit.com")) return platform.submissionUrl;
      url.searchParams.set("title", kit.redditTitle || kit.title);
      url.searchParams.set("url", utmUrl);
      return url.toString();
    } catch {
      return platform.submissionUrl;
    }
  }
}

class ProductHuntAdapter extends AssistedAdapter {
  readonly key = "product-hunt";
}

/**
 * AUTOMATED: the contract for an approved API integration. No platform is
 * configured with one, so `submit` reports that plainly. A real integration
 * subclasses this and overrides `submit`/`getStatus`/`getPublishedUrl`.
 */
class AutomatedAdapter extends PreparedAdapter {
  readonly key: string = "automated";

  async submit(platform: LaunchPlatform): Promise<SubmitResult> {
    return {
      ok: false,
      status: "FAILED",
      error: `${platform.name} connection failed. No approved integration is configured for this platform, so nothing was submitted.`,
    };
  }
}

const ADAPTERS: Record<string, LaunchPlatformAdapter> = {
  "show-hn": new ShowHnAdapter(),
  reddit: new RedditAdapter(),
  "product-hunt": new ProductHuntAdapter(),
};

const BY_LEVEL = {
  AUTOMATED: new AutomatedAdapter(),
  ASSISTED: new AssistedAdapter(),
  AI_PREPARED: new PreparedAdapter(),
} as const;

export function adapterFor(platform: Pick<LaunchPlatform, "adapter" | "automationLevel">): LaunchPlatformAdapter {
  // A named adapter only applies while the platform is not AUTOMATED — an admin
  // flipping the level must reach the adapter that can actually submit.
  if (platform.automationLevel !== "AUTOMATED" && ADAPTERS[platform.adapter]) return ADAPTERS[platform.adapter];
  return BY_LEVEL[platform.automationLevel];
}

export const KNOWN_ADAPTER_KEYS = ["default", ...Object.keys(ADAPTERS)];
