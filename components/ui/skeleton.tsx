import { cn } from "@/lib/utils"

/**
 * Placeholder block for loading states.
 *
 * Uses `bg-secondary-bg` (#fdf2ea, the peach surface) rather than `bg-muted`:
 * `--color-muted` is the mid-grey *text* colour (#6b7280) in this system's
 * @theme block, which overrides the shadcn `--muted` surface that
 * `@theme inline` maps in. `bg-muted` therefore painted solid grey slabs
 * instead of a soft placeholder.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-secondary-bg", className)}
      {...props}
    />
  )
}

export { Skeleton }
