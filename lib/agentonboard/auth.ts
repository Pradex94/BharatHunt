import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeEmail } from "@agentonboard/sdk";

import { getAgentAudience } from "./config";
export { getAgentAudience };

/**
 * Ensures a `profiles` row exists in Supabase for the given Clerk user id.
 */
async function ensureAgentProfile(clerkUser: {
  id: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}, email: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", clerkUser.id)
    .maybeSingle();

  if (existing) return;

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    email.split("@")[0] ||
    "Agent User";

  let username = (clerkUser.username || email.split("@")[0] || `user_${clerkUser.id.slice(-8)}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!username) username = `user_${clerkUser.id.slice(-8)}`;

  // Guarantee username uniqueness across profiles
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: conflict } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", clerkUser.id)
      .maybeSingle();
    if (!conflict) break;
    username = `${username}${Math.random().toString(36).slice(2, 6)}`;
  }

  await supabase.from("profiles").upsert({
    id: clerkUser.id,
    username,
    display_name: displayName,
    avatar_url: clerkUser.imageUrl || null,
  });
}

/**
 * Resolves an AgentOnboard identity by looking up the verified email in Clerk.
 * If found, ensures the profile exists in Supabase and returns the Clerk user ID.
 * If not found, returns null (triggering 403 ACCOUNT_REQUIRED).
 */
export async function resolveAgentAccount({ email }: { email: string }): Promise<string | null> {
  const cleanEmail = normalizeEmail(email);
  const client = await clerkClient();

  const response = await client.users.getUserList({
    emailAddress: [cleanEmail],
  });

  const clerkUser = response.data[0];
  if (!clerkUser) {
    return null;
  }

  await ensureAgentProfile(clerkUser, cleanEmail);
  return clerkUser.id;
}

/**
 * Creates a Clerk user and Supabase profile for an AgentOnboard identity.
 * Runs only on the signup route when an account does not exist yet.
 */
export async function createAgentAccountRecord({ email }: { email: string }): Promise<string> {
  const cleanEmail = normalizeEmail(email);
  const client = await clerkClient();

  // 1. Idempotency check: in case of double registration, sign in instead of duplicating
  const existingUsers = await client.users.getUserList({
    emailAddress: [cleanEmail],
  });

  let clerkUser = existingUsers.data[0];

  if (!clerkUser) {
    const baseName = cleanEmail.split("@")[0].replace(/[^a-z0-9_]/g, "");
    clerkUser = await client.users.createUser({
      emailAddress: [cleanEmail],
      skipPasswordRequirement: true,
      firstName: baseName || "Agent",
    });

    if (clerkUser.primaryEmailAddressId) {
      try {
        await client.emailAddresses.updateEmailAddress(clerkUser.primaryEmailAddressId, {
          verified: true,
        });
      } catch (err) {
        // If updating verified status fails (e.g. permission or already verified), continue
        console.warn("[agentonboard] Could not mark primary email as verified:", err);
      }
    }
  }

  // 2. Ensure Supabase profile row exists
  await ensureAgentProfile(clerkUser, cleanEmail);

  return clerkUser.id;
}
