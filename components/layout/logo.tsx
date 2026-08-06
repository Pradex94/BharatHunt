"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Built-in fallback mark — always renders, never breaks. */
function BrandMark() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold leading-none text-white">
      B
    </span>
  );
}

/**
 * Bharat Hunt lockup. Shows the built-in "B" mark by default and upgrades to the
 * custom icon at `public/brand-icon.png` automatically once that file exists —
 * so a missing file never renders a broken image.
 */
export function Logo({
  href = "/",
  className,
  tone = "light",
}: {
  href?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setIconSrc("/brand-icon.png");
    img.src = "/brand-icon.png";
  }, []);

  return (
    <Link
      href={href}
      className={cn(
        "flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight",
        tone === "dark" ? "text-white" : "text-ink",
        className,
      )}
    >
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
      ) : (
        <BrandMark />
      )}
      <span className="font-display text-xl font-bold tracking-tight">
        भारत <span className="text-primary">Hunt</span>
      </span>
    </Link>
  );
}
