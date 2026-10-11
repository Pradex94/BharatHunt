import { NextResponse } from "next/server";
import { requireAgentAccount } from "@agentonboard/sdk/next";
import { getAgentAudience, resolveAgentAccount } from "@/lib/agentonboard/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const session = await requireAgentAccount(request, {
    audience: getAgentAudience(),
    resolveAccount: resolveAgentAccount,
  });

  if (!session.ok) {
    return session.response;
  }

  const userId = session.user;
  const { slug } = await props.params;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text) as Record<string, unknown>;
    }
  } catch {
    // Empty body is totally fine for standard upvote
  }

  const supabase = createServiceClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, slug, upvote_count")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("upvotes")
    .select("product_id")
    .eq("product_id", product.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (body.action === "remove") {
    if (existing) {
      await supabase
        .from("upvotes")
        .delete()
        .eq("product_id", product.id)
        .eq("user_id", userId);
    }
    return NextResponse.json({ upvoted: false });
  }

  // Idempotent upvote: if already voted, return 200 with already_voted: true
  if (existing) {
    return NextResponse.json({ upvoted: true, already_voted: true });
  }

  const { error: insertError } = await supabase
    .from("upvotes")
    .insert({ product_id: product.id, user_id: userId });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ upvoted: true, already_voted: false }, { status: 200 });
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const session = await requireAgentAccount(request, {
    audience: getAgentAudience(),
    resolveAccount: resolveAgentAccount,
  });

  if (!session.ok) {
    return session.response;
  }

  const userId = session.user;
  const { slug } = await props.params;

  const supabase = createServiceClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  await supabase
    .from("upvotes")
    .delete()
    .eq("product_id", product.id)
    .eq("user_id", userId);

  return NextResponse.json({ upvoted: false });
}
