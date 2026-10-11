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
    // Empty body is fine for standard save
  }

  const supabase = createServiceClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("bookmarks")
    .select("product_id")
    .eq("product_id", product.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (body.action === "remove") {
    if (existing) {
      await supabase
        .from("bookmarks")
        .delete()
        .eq("product_id", product.id)
        .eq("user_id", userId);
    }
    return NextResponse.json({ saved: false });
  }

  // Idempotent save: if already saved, return 200 with already_saved: true
  if (existing) {
    return NextResponse.json({ saved: true, already_saved: true });
  }

  const { error: insertError } = await supabase
    .from("bookmarks")
    .insert({ product_id: product.id, user_id: userId });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true, already_saved: false }, { status: 200 });
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
    .from("bookmarks")
    .delete()
    .eq("product_id", product.id)
    .eq("user_id", userId);

  return NextResponse.json({ saved: false });
}
