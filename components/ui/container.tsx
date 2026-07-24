import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Centered, max-width page wrapper used to constrain content width.
 * Responsive horizontal padding on an 8px scale: 16px → 24px → 32px.
 */
function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

export { Container };
