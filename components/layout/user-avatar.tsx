"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Only the two fields this needs, rather than Clerk's `UserResource`.
 * `@clerk/types` is a transitive dependency, not a direct one, so importing the
 * full type here would couple the component to a package this app does not
 * declare — and the structural shape documents the actual requirement.
 */
type AvatarUser = {
  hasImage: boolean;
  imageUrl: string;
};

/**
 * The signed-in user's avatar, used everywhere the navbar shows an identity
 * (desktop dropdown trigger, mobile menu). One component so the two surfaces
 * cannot drift — the previous code inlined `<Avatar><AvatarFallback/></Avatar>`
 * in both places and neither ever rendered an image.
 *
 * Data source is Clerk's already-loaded session user, not a database read.
 * `profiles.avatar_url` mirrors the same value (written by the Clerk webhook
 * and by ensureProfile), but the navbar is a client component that already
 * holds the Clerk user — querying Supabase for a copy of what is in hand would
 * add a round-trip to every page for nothing.
 */

/** First letters of the first two words, e.g. "Pradex Bisla" → "PB". */
export function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "?";
}

export function UserAvatar({
  user,
  displayName,
  size = "sm",
  className,
}: {
  user: AvatarUser | null | undefined;
  displayName: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  /*
   * `hasImage` distinguishes a real uploaded avatar from the placeholder Clerk
   * generates for everyone. `imageUrl` is always populated, so keying off it
   * alone would render Clerk's generic gradient-initials PNG and we would never
   * show our own fallback — and that generic image is not this design system.
   */
  const src = user?.hasImage ? user.imageUrl : undefined;

  return (
    <Avatar size={size} className={className}>
      {src && (
        <AvatarImage
          src={src}
          alt=""
          // Base UI swaps to <AvatarFallback> on load failure, so a dead or
          // 403'd URL degrades to initials on its own — no onError wiring.
          onLoadingStatusChange={(status) => {
            if (status === "error" && process.env.NODE_ENV !== "production") {
              // Dev-only, and deliberately without the URL: avatar URLs carry
              // a user identifier, which does not belong in a shipped console.
              console.warn("[UserAvatar] avatar image failed to load; using initials");
            }
          }}
        />
      )}
      {/* Renders when there is no image and when one fails. Brand treatment
          matches the maker initial on product cards. */}
      <AvatarFallback className={cn("bg-primary/10 font-semibold text-primary")}>
        {getInitials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}
