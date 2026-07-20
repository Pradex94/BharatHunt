import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";

export async function SiteHeader() {
  const { userId } = await auth();

  let displayName: string | null = null;
  if (userId) {
    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    displayName = profile?.display_name ?? null;
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="text-lg font-semibold text-foreground">
        BharatHunt
      </Link>
      {userId ? (
        <div className="flex items-center gap-3">
          <Link href="/submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Submit
          </Link>
          <span className="text-sm text-muted-foreground">{displayName ?? "Account"}</span>
          <SignOutButton>
            <Button type="button" variant="outline" size="sm">
              Log out
            </Button>
          </SignOutButton>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
}
