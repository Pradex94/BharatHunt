/**
 * Status vocabulary and the transitions a maker may make by hand.
 *
 * The database's words are not the maker's words, so every label lives here —
 * one place, shared by the cards, the progress list and the Copilot.
 */

import type { AutomationLevel, PlatformCampaignStatus, RequirementCheck } from "./types.ts";

export const AUTOMATION_META: Record<AutomationLevel, { label: string; dot: string; description: string }> = {
  AUTOMATED: {
    label: "Automated",
    dot: "🟢",
    description: "Connected through the platform's approved API. BharatHunt can submit once you connect.",
  },
  ASSISTED: {
    label: "Assisted",
    dot: "🟡",
    description: "We prepare the submission and open the official form for you. You press submit.",
  },
  AI_PREPARED: {
    label: "Prepared kit",
    dot: "🔵",
    description: "We prepare everything the platform asks for. You submit it on the platform yourself.",
  },
};

export const STATUS_META: Record<PlatformCampaignStatus, { label: string; tone: "neutral" | "progress" | "ready" | "warn" | "done" | "error" }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  ANALYZING: { label: "Preparing…", tone: "progress" },
  READY: { label: "Launch kit ready", tone: "ready" },
  MISSING_INFORMATION: { label: "Missing information", tone: "warn" },
  READY_TO_SUBMIT: { label: "Ready to submit", tone: "ready" },
  SUBMITTED: { label: "Submitted (marked by you)", tone: "progress" },
  PUBLISHED: { label: "Published (marked by you)", tone: "done" },
  FAILED: { label: "Failed", tone: "error" },
  USER_ACTION_REQUIRED: { label: "Your action needed", tone: "warn" },
};

/** Status after preparation, from the checklist and the platform's automation level. */
export function preparedStatus(level: AutomationLevel, checks: RequirementCheck[]): PlatformCampaignStatus {
  if (checks.some((check) => check.required && check.status === "missing")) return "MISSING_INFORMATION";
  if (level === "AUTOMATED") return "USER_ACTION_REQUIRED";
  return level === "ASSISTED" ? "READY_TO_SUBMIT" : "READY";
}

/** What the maker can report by hand, from each status. */
const MANUAL_TRANSITIONS: Partial<Record<PlatformCampaignStatus, PlatformCampaignStatus[]>> = {
  NOT_STARTED: [],
  READY: ["SUBMITTED", "PUBLISHED"],
  READY_TO_SUBMIT: ["SUBMITTED", "PUBLISHED"],
  MISSING_INFORMATION: ["SUBMITTED", "PUBLISHED"],
  USER_ACTION_REQUIRED: ["SUBMITTED", "PUBLISHED"],
  FAILED: ["SUBMITTED", "PUBLISHED"],
  SUBMITTED: ["PUBLISHED", "READY"],
  PUBLISHED: ["SUBMITTED"],
};

/**
 * Whether a maker may set `to` by hand. AUTOMATED platforms are excluded: their
 * submitted/published state must come from the integration, never a button,
 * or "Automated · Published" would be a claim nothing confirmed.
 */
export function canMarkManually(level: AutomationLevel, from: PlatformCampaignStatus, to: PlatformCampaignStatus): boolean {
  if (level === "AUTOMATED") return false;
  return (MANUAL_TRANSITIONS[from] ?? []).includes(to);
}
