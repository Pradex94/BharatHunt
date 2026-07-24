import Link from "next/link";
import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/** Bharat Hunt wordmark: orange gradient square + flame, then the name. */
export function Logo({
  href = "/",
  className,
  tone = "light",
}: {
  href?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight",
        tone === "dark" ? "text-white" : "text-ink",
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-[0_4px_12px_-2px_rgba(255,107,26,0.5)]">
        <Flame className="size-[18px]" />
      </span>
      <span>
        भारत <span className="font-extrabold">Hunt</span>
      </span>
    </Link>
  );
}
