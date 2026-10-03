/**
 * The "I am a" choices on /discover. Their own module with no imports, so the
 * client form can use them without pulling the concept lexicon into the
 * browser bundle. Keys match AUDIENCES in concepts.ts.
 */
export const MATCH_AUDIENCES = [
  { key: "founder", label: "Founder" },
  { key: "student", label: "Student" },
  { key: "developer", label: "Developer" },
  { key: "creator", label: "Creator" },
  { key: "marketer", label: "Marketer" },
  { key: "small-business", label: "Small business" },
  { key: "enterprise", label: "Enterprise" },
] as const;
