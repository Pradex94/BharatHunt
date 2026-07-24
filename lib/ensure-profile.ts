import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarantees a `profiles` row exists for the signed-in Clerk user, returning
 * their id. Every table that stores a user identity (products.creator_id,
 * comments.user_id, upvotes.user_id, …) has a foreign key to profiles.id, so
 * any write on those tables must be preceded by a profile.
 *
 * Profiles are normally created by the Clerk `user.created` webhook
 * (app/api/webhooks/clerk/route.ts), but that webhook is unreliable in local
 * dev (no public tunnel) and can miss users who signed up before it existed —
 * which surfaces as `products_creator_id_fkey` violations on submit. This is
 * the self-healing fallback: it runs under the user's own Clerk token, which
 * the "Users can insert their own profile" RLS policy permits.
 *
 * Returns the user id on success, or null if there is no signed-in user.
 */
export async function ensureProfile(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createClient();

  // Fast path: profile already exists — the common case, one cheap read.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return userId;

  // Build a profile from Clerk's user record, mirroring the webhook's logic.
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    email?.split("@")[0] ||
    "New user";

  const base = (user?.username || email?.split("@")[0] || `user_${userId.slice(-8)}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  let username = base || `user_${userId.slice(-8)}`;

  // Ensure the username is unique against other profiles.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", userId)
      .maybeSingle();
    if (!taken) break;
    username = `${username}${Math.random().toString(36).slice(2, 6)}`;
  }

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    username,
    display_name: displayName,
    avatar_url: user?.imageUrl || null,
  });

  if (error) {
    throw new Error(`Failed to create your profile: ${error.message}`);
  }

  return userId;
}
