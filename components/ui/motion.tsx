"use client";

import type { ComponentPropsWithoutRef } from "react";
import { motion, type Variants } from "framer-motion";

/*
 * Never wrap above-the-fold content in these.
 *
 * `initial="hidden"` is rendered into the server HTML as
 * `style="opacity:0;transform:translateY(16px)"`, and the content only becomes
 * visible once this bundle has downloaded, hydrated, and its
 * IntersectionObserver has fired. Chrome does not treat an element at opacity 0
 * as painted, so anything wrapped here cannot be the Largest Contentful Paint
 * until hydration finishes — however fast the server was.
 *
 * That is not theoretical. Every first-viewport block on this site was wrapped
 * this way, and a headless-Chrome trace of production named the *navbar logo*
 * as the LCP element of the homepage: a 1.5s screenshot showed the hero area
 * completely blank — no headline, no CTAs, no leading launch. The measured
 * LCP-minus-FCP gap was 3.1s on /marketplace, 5.2s on a collection page and
 * 6.5s on a category page.
 *
 * So: the first screenful is painted, and entrance animations start below it.
 * Transform-only CSS animations (`animate-bh-float`) are fine anywhere — they
 * never drop opacity, so they cost LCP nothing.
 */
const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Fades a single element up into place once it scrolls into view. */
export function FadeIn({
  className,
  delay = 0,
  ...props
}: ComponentPropsWithoutRef<typeof motion.div> & { delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUpVariants}
      transition={{ delay }}
      {...props}
    />
  );
}

/** Wraps a grid/list; direct FadeInItem children fade up in a stagger. */
export function FadeInStagger({ className, ...props }: ComponentPropsWithoutRef<typeof motion.div>) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={staggerContainerVariants}
      {...props}
    />
  );
}

export function FadeInItem({ className, ...props }: ComponentPropsWithoutRef<typeof motion.div>) {
  return <motion.div className={className} variants={fadeUpVariants} {...props} />;
}
