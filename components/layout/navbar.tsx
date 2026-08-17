"use client";

/* Design system: design.md (Bharat Hunt — orange) · sticky glass top-nav
 * Logo + menu + search + Log in + Launch Product (orange gradient).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { MenuIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_EMAILS, NAV_LINKS } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { SearchAutocomplete } from "@/components/layout/search-autocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "?";
}

export function Navbar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [authStalled, setAuthStalled] = useState(false);

  /*
   * Clerk loads from its own domain, and when that request never finishes --
   * a blocked script, an offline moment, a dev server restarted underneath an
   * open tab -- `isLoaded` stays false forever. Rendering the skeleton on that
   * condition alone left the navbar showing two grey pills with no way to log
   * in at all. After a short grace period we stop waiting and draw the
   * logged-out state, which is the honest guess: `isSignedIn` is false until
   * proven otherwise, and the buttons are plain links that work regardless.
   */
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setAuthStalled(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  // Only hold the skeleton while Clerk is plausibly still on its way.
  const showAuthSkeleton = !isLoaded && !authStalled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const displayName =
    user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "Account";

  // Cosmetic only — the /admin page and admin actions enforce this server-side.
  const isAdmin = (user?.emailAddresses ?? []).some((address) =>
    ADMIN_EMAILS.includes(address.emailAddress.toLowerCase()),
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-white/10 bg-surface-dark transition-shadow duration-200 ease-out",
        scrolled && "shadow-lg shadow-black/20",
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo tone="dark" />

          <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <SearchAutocomplete className="hidden xl:block" />

            {showAuthSkeleton ? (
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-16 bg-white/10" />
                <Skeleton className="h-9 w-32 bg-white/10" />
              </div>
            ) : isSignedIn ? (
              <div className="flex items-center gap-3">
                <Link href="/submit" className={buttonVariants({ size: "sm" })}>
                  Launch Product
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 pl-1.5 text-white hover:bg-white/10 hover:text-white"
                      />
                    }
                  >
                    <Avatar size="sm">
                      <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-24 truncate">{displayName}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                      Your products
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem onClick={() => router.push("/admin")}>
                        Admin dashboard
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => signOut({ redirectUrl: "/" })}
                    >
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
                >
                  Log in
                </Link>
                <Link href="/submit" className={buttonVariants({ size: "sm" })}>
                  Launch Product
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open menu"
                    className="size-11 text-white hover:bg-white/10 hover:text-white"
                  />
                }
              >
                <MenuIcon aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-xs">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-4 px-4">
                  <SearchAutocomplete
                    tone="light"
                    onNavigate={() => setMobileOpen(false)}
                  />

                  <nav aria-label="Primary" className="flex flex-col gap-1">
                    {NAV_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-body transition-colors duration-200 hover:bg-secondary-bg hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                </div>

                <div className="mt-auto flex flex-col gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {showAuthSkeleton ? (
                    <>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </>
                  ) : isSignedIn ? (
                    <>
                      <div className="flex items-center gap-2 px-1 py-1">
                        <Avatar size="sm">
                          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium text-ink">
                          {displayName}
                        </span>
                      </div>
                      <Link
                        href="/submit"
                        onClick={() => setMobileOpen(false)}
                        className={buttonVariants({ className: "w-full" })}
                      >
                        Launch Product
                      </Link>
                      <Link
                        href="/dashboard"
                        onClick={() => setMobileOpen(false)}
                        className={buttonVariants({ variant: "outline", className: "w-full" })}
                      >
                        Your products
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setMobileOpen(false)}
                          className={buttonVariants({ variant: "outline", className: "w-full" })}
                        >
                          Admin dashboard
                        </Link>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setMobileOpen(false);
                          void signOut({ redirectUrl: "/" });
                        }}
                      >
                        Log out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMobileOpen(false)}
                        className={buttonVariants({ variant: "outline", className: "w-full" })}
                      >
                        Log in
                      </Link>
                      <Link
                        href="/submit"
                        onClick={() => setMobileOpen(false)}
                        className={buttonVariants({ className: "w-full" })}
                      >
                        Launch Product
                      </Link>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </Container>
    </header>
  );
}
