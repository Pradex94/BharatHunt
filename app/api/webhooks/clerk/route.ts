import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { checkEmail } from "@/lib/disposable-email";

// Runs with no end-user session (Clerk calls this server-to-server), so it
// uses the service role key to bypass RLS instead of the usual Clerk-token
// based client in lib/supabase/server.ts.
function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function buildUsername(clerkUsername: string | null, email: string | undefined, id: string): string {
  const base = (clerkUsername || email?.split("@")[0] || `user_${id.slice(-8)}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return base || `user_${id.slice(-8)}`;
}

export async function POST(request: NextRequest) {
  const event = await verifyWebhook(request);
  const supabase = createServiceClient();

  if (event.type === "user.created" || event.type === "user.updated") {
    const user = event.data;
    const email = user.email_addresses.find(
      (address) => address.id === user.primary_email_address_id,
    )?.email_address;
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      email?.split("@")[0] ||
      "New user";

    /*
     * Disposable-email gate.
     *
     * This is the last server-side boundary this application controls. Account
     * creation itself happens on Clerk's infrastructure — there is no signup
     * route or `createUser` call in this codebase — so the primary block is the
     * "Block disposable email addresses" restriction in the Clerk Dashboard.
     * This is defence in depth for anything that predates or slips past it.
     *
     * Refusing the profile row is meaningful rather than cosmetic: every
     * BharatHunt capability (products.creator_id, comments.user_id,
     * upvotes.user_id) is a foreign key to profiles.id, so an account with no
     * profile cannot launch, comment or vote. 200 rather than 4xx because a
     * non-2xx makes Clerk retry a decision that will never change.
     *
     * Scoped to user.created: a user.updated event for an existing member must
     * not delete their profile out from under them if their domain is later
     * added to the list. Pre-existing accounts are unaffected by design.
     */
    if (event.type === "user.created") {
      const verdict = checkEmail(email);
      if (!verdict.ok && verdict.reason === "disposable") {
        // Domain only — never the address, which is personal data.
        console.warn(
          JSON.stringify({
            event: "signup_blocked",
            reason: "disposable_email",
            domain: email?.split("@").pop() ?? "unknown",
            endpoint: "webhook:clerk/user.created",
            at: new Date().toISOString(),
          }),
        );
        return new Response("OK", { status: 200 });
      }
    }

    let username = buildUsername(user.username, email, user.id);

    // Ensure uniqueness against other profiles (not this user's own row,
    // in case this is an update and the username hasn't actually changed).
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();
      if (!existing) break;
      username = `${username}${Math.random().toString(36).slice(2, 6)}`;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      username,
      display_name: displayName,
      avatar_url: user.image_url || null,
    });

    if (error) {
      console.error("Failed to upsert profile from Clerk webhook:", error);
      return new Response("Failed to sync profile", { status: 500 });
    }
  }

  if (event.type === "user.deleted" && event.data.id) {
    await supabase.from("profiles").delete().eq("id", event.data.id);
  }

  return new Response("OK", { status: 200 });
}
