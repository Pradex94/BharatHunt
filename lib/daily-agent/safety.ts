/**
 * The safety gate: what the agent must never put live on its own.
 *
 * Adult and fraud terms reuse the submission moderator's lexicons
 * (lib/moderation.ts), so a curated listing is held to exactly the rule a
 * maker's launch is. Gambling, malware and unverifiable-claim vocabulary is
 * added here because a maker's form never needed it.
 *
 * Where the term appears matters. In the site's own title or description it is
 * what the product *is*, and the candidate is ineligible. Anywhere else in the
 * body it may be a blog post, a policy page or a footer, so the candidate goes
 * to a human (`needs_review`) instead of being judged by a word list.
 *
 * Pure, so `tests/` can pin it.
 */

import { containsAdultContent, containsFraudulentContent } from "../moderation.ts";

export type SafetyFlag = "adult" | "gambling" | "fraud" | "malware" | "illegal" | "misleading_claims";

const GAMBLING =
  /\b(online casino|casino games|sports ?betting|betting tips|bet now|sportsbook|satta|matka|real[- ]money (?:rummy|poker|teen patti|games?)|win real cash|cricket betting|aviator game|color prediction)\b/i;
const MALWARE = /\b(cracked apk|crack ?\+? ?keygen|keygen|serial key generator|warez|nulled (?:themes?|plugins?|scripts?)|mod apk unlimited)\b/i;
const ILLEGAL =
  /\b(buy (?:instagram |youtube )?followers|fake (?:documents|aadhaar|pan card|degree)|hack (?:whatsapp|instagram|facebook)|carding|cvv shop|escort services?|drugs? delivery)\b/i;
const MISLEADING =
  /\b(guaranteed returns?|double your money|100% guaranteed (?:profit|income|returns)|risk[- ]free (?:profit|returns)|get rich quick|earn ₹?\d[\d,]* (?:daily|per day) from home)\b/i;
/** Superlatives a site may use but we will not repeat or rely on. */
export const HYPE =
  /(#\s?1\b|\bno\.? ?1\b|\bnumber one\b|\bworld'?s (?:first|best|only|leading|largest)\b|\bindia'?s (?:first|best|#1|no\.? ?1|leading|largest)\b|\b(?:a|the) leading\b|\b(?:industry|market)[- ]leading\b|\bworld[- ]class\b|\brevolutionary\b|\bbest[- ]in[- ]class\b|\bguaranteed\b|\bunbeatable\b|\bgame[- ]?changer\b)/i;

function flagsIn(text: string): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  if (containsAdultContent(text)) flags.push("adult");
  if (GAMBLING.test(text)) flags.push("gambling");
  if (containsFraudulentContent(text)) flags.push("fraud");
  if (MALWARE.test(text)) flags.push("malware");
  if (ILLEGAL.test(text)) flags.push("illegal");
  if (MISLEADING.test(text)) flags.push("misleading_claims");
  return flags;
}

export type SafetyAssessment = {
  /** Flags in the title/description: the product itself. Hard stop. */
  hard: SafetyFlag[];
  /** Flags only in the body: a human looks. */
  soft: SafetyFlag[];
};

export function assessSafety(headline: string, bodyText: string): SafetyAssessment {
  const hardAll = flagsIn(headline);
  // Misleading claims are never a hard stop on their own: the product may be
  // fine and the copy overblown. A human decides.
  const hard: SafetyFlag[] = hardAll.filter((flag) => flag !== "misleading_claims");
  const soft = [
    ...new Set([...hardAll.filter((flag) => flag === "misleading_claims"), ...flagsIn(bodyText)]),
  ].filter((flag) => !hard.includes(flag));
  return { hard, soft };
}
