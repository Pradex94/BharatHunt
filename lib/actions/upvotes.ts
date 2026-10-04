"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";

export type UpvoteActionState = { error?: string } | undefined;

export async function toggleUpvote(productId: string): Promise<UpvoteActionState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  // A vote is one row plus a counter update, and the button is trivially
  // scriptable once you hold a session. 30/min is far above human tapping.
  const limit = await checkRateLimitByIpAndUser("upvote", userId);
  if (!limit.ok) {
    return { error: limit.message };
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("upvotes")
    .select("product_id")
    .eq("product_id", productId)
    .eq("user_id", userId)
    .maybeSingle();


  if (existing) {
    const { error } = await supabase
      .from("upvotes")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    if (error) return { error: error.message };
  } else {
    // profiles.id FK guard — the Clerk webhook may not have created this row.
    try {
      await ensureProfile();
    } catch (profileError) {
      return {
        error:
          profileError instanceof Error ? profileError.message : "Could not prepare your profile.",
      };
    }
    const { error } = await supabase
      .from("upvotes")
      .insert({ product_id: productId, user_id: userId });
    if (error) return { error: error.message };
  }

  // upvote_count follows the insert/delete through a trigger on `upvotes`
  // (20261005000000); the action never writes a counter itself.
  revalidatePath("/");
}
