/**
 * Feature access for the Launch Agent.
 *
 * Everything is free today, and nothing in the UI mentions tiers. This module
 * exists so a later Free / Pro / Enterprise split is one function body and a
 * table read, not a rewrite: every server action already asks `featureAccess`
 * before doing work, and `launch_campaigns.access_tier` is already stored.
 */

export type AccessTier = "free";

export type LaunchAgentFeature = "analyze" | "prepare" | "regenerate" | "copilot" | "submit";

export type FeatureAccess = { allowed: true; tier: AccessTier } | { allowed: false; tier: AccessTier; reason: string };

export function featureAccess(input: { userId: string; tier?: string | null; feature: LaunchAgentFeature }): FeatureAccess {
  // Every input is accepted today; the tier gate reads `input.tier` and `input.feature` when one exists.
  void input;
  return { allowed: true, tier: "free" };
}
