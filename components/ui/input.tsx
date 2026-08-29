import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        /*
         * `pointer-coarse:h-11`, not a breakpoint.
         *
         * The 32px height is a mouse-sized control: fine on a desktop, under
         * every touch guideline on a finger (44px on iOS, 48dp on Android).
         * The distinction that matters is the input device, not the screen
         * width — a 1024px tablet is touch and a 1280px laptop is not — so
         * this asks the pointer directly. Desktop rendering is untouched, and
         * it costs no JavaScript.
         *
         * `text-base md:text-sm` is already correct and deliberate: iOS zooms
         * the page when a focused field is under 16px, so mobile keeps 16px.
         */
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none pointer-coarse:h-11 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
