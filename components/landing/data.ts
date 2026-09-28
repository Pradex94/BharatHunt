import {
  Eye,
  Link2,
  MessageSquare,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Presentation constants for the landing page.
 *
 * Everything a visitor can read as a *claim* — products, upvote counts, maker
 * and community numbers — is queried live in `app/page.tsx`. Only our own copy
 * about how launching works lives here, and every line of it describes
 * something the product actually does today (lib/faqs.ts is the reference):
 * the link import, the human review, the daily board, the followed backlink,
 * Launch Agent. Nothing here promises traffic, users or investment.
 */

export type FounderBenefit = { title: string; description: string; icon: LucideIcon };

export const FOUNDER_BENEFITS: FounderBenefit[] = [
  {
    title: "Product visibility",
    description:
      "A permanent product page, listed in search, its category and every collection it fits — with a followed link to your site.",
    icon: Eye,
  },
  {
    title: "Founder discovery",
    description: "Your name on the launch, so people find the maker as well as the product.",
    icon: UserRound,
  },
  {
    title: "Community exposure",
    description: "Upvotes, comments and questions from people who actually opened your product.",
    icon: MessageSquare,
  },
  {
    title: "Launch ranking",
    description:
      "Compete on the daily board. The day’s leading launch is featured as Hunt of the Day.",
    icon: Trophy,
  },
  {
    title: "Investor visibility",
    description:
      "A public launch page beside Bharat Hunt’s funding and investor intelligence — a link worth sending.",
    icon: Link2,
  },
];

export type LaunchStep = { title: string; description: string };

export const LAUNCH_STEPS: LaunchStep[] = [
  {
    title: "Submit your product",
    description: "Paste your URL — we pull in your logo, description and screenshots. Free.",
  },
  {
    title: "Launch",
    description: "A person reviews every submission, usually within a day, then it goes live.",
  },
  {
    title: "Get discovered",
    description: "On the daily board, in search, and in your category and collections.",
  },
  {
    title: "Grow visibility",
    description: "Launch Agent plans where to launch next and prepares the copy for each platform.",
  },
  {
    title: "Connect with the ecosystem",
    description: "Answer comments, meet other makers, and keep your listing current as you ship.",
  },
];
