import type { FaqItem } from "@/components/seo/faq";
import { MAX_PRODUCTS_PER_USER } from "@/lib/constants";

/**
 * The site-level FAQ, rendered on /faq and reused wherever a subset fits.
 *
 * Every answer here is checkable against the code that implements it — the
 * review gate in `lib/review.ts`, the launch limit in `lib/constants.ts`, the
 * `rel="noopener"` on outbound product links, the absence of any ratings table.
 * That is the standard for this file: if an answer stops being true, the
 * behaviour it describes has changed and the answer changes with it.
 *
 * Deliberately short. Fifteen invented questions would produce more markup and
 * less use; these are the ones people actually ask before launching.
 */
export const SITE_FAQS: FaqItem[] = [
  {
    question: "What is Bharat Hunt?",
    answer:
      "A launch platform for software built by Indian makers. Founders submit what they have built, and the community discovers it, upvotes it and leaves feedback. Every listing links out to the product's own site.",
  },
  {
    question: "Does it cost anything to launch a product?",
    answer:
      "No. Submitting and listing a product is free, and there is no paid placement in the marketplace ranking.",
  },
  {
    question: "How long does it take for my launch to go live?",
    answer:
      "A person reviews every submission before it is published, usually within a day. You get an email the moment it goes live, and if something needs changing you get an email explaining what, with the product back in your drafts so you can revise and resubmit.",
  },
  {
    question: "Why was my launch sent back?",
    answer:
      "The most common reasons are a link that does not resolve to a working public product, a description too thin to tell anyone what the product does, or a duplicate of a listing that already exists. The email you receive names the specific reason.",
  },
  {
    question: "Do I get a link back to my site?",
    answer:
      "Yes. Your product page links to your site with a normal followed link, tagged with ?ref=bharathunt so the visit shows up in your analytics by name rather than as direct traffic.",
  },
  {
    question: "How many products can I launch?",
    answer: `Up to ${MAX_PRODUCTS_PER_USER} per account. The limit exists to keep the marketplace a place for products people actually built rather than a listing farm.`,
  },
  {
    question: "How are products ranked?",
    answer:
      "By community upvotes, recency and activity, depending on the sort you choose. There are no star ratings or written reviews on Bharat Hunt, so nothing here is ranked by a quality score — an upvote count is a measure of how many people backed a launch, and that is all it claims to be.",
  },
  {
    question: "Can I edit a product after it is published?",
    answer:
      "Yes, from your dashboard, and edits go live immediately. Pricing, features and links change constantly, so keeping a listing current is the maker's to do.",
  },
];
