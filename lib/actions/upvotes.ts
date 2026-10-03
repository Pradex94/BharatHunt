"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";

export type UpvoteActionState = { error?: string } | undefined;

async function countTransitionally(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  column: "upvote_count",
  delta: number,
): Promise<void> {
  const { error } = await supabase.rpc("increment_product_counter", {
    target_product_id: productId,
    counter_column: column,
    delta,
  });
  if (error) console.error(`[upvotes] transitional counter call failed: ${error.message}`);
}

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
  // (20261005000000). Transitional: until that migration is applied this RPC
  // still does the counting; after it, the RPC is a no-op. Either order of
  // deploy and migration counts correctly. Remove once it is applied.
  await countTransitionally(supabase, productId, "upvote_count", existing ? -1 : 1);
  revalidatePath("/");
}
