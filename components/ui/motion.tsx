"use client";

import type { ComponentPropsWithoutRef } from "react";
import { motion, type Variants } from "framer-motion";

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
