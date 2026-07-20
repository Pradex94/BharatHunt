"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

export type UpvoteActionState = { error?: string } | undefined;

export async function toggleUpvote(productId: string): Promise<UpvoteActionState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("upvotes")
    .select("product_id")
    .eq("product_id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  const delta = existing ? -1 : 1;

  if (existing) {
    const { error } = await supabase
      .from("upvotes")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("upvotes")
      .insert({ product_id: productId, user_id: userId });
    if (error) return { error: error.message };
  }

  const { error: counterError } = await supabase.rpc("increment_product_counter", {
    target_product_id: productId,
    counter_column: "upvote_count",
    delta,
  });
  if (counterError) return { error: counterError.message };

  revalidatePath("/");
}
