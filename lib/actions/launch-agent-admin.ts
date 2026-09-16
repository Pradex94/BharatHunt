"use server";

/**
 * Admin actions for the Launch Agent platform registry.
 *
 * Same contract as lib/actions/funding-admin.ts: identity, then admin, as the
 * first two statements of every export. The registry decides what badge a maker
 * sees ("Automated" is a promise), so it is only ever written here, under the
 * service role, after `isAdminUser` passes.
 */

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAdminUser } from "@/lib/admin";
import { validatePlatformInput, type PlatformInput } from "@/lib/launch-agent/registry";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

export type LaunchAdminResult = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; actor: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };
  const user = await currentUser();
  if (!isAdminUser(user)) {
    console.warn(JSON.stringify({ event: "launch_agent_admin_denied", userId, at: new Date().toISOString() }));
    return { ok: false, error: "You do not have access to manage launch platforms." };
  }
  return { ok: true, actor: userId };
}

function refresh() {
  revalidatePath("/admin/launch-agent");
  revalidatePath("/dashboard/launch-agent", "layout");
}

/** Create (id null) or update a platform. Marking it re-verified stamps today's date. */
export async function saveLaunchPlatform(
  id: string | null,
  input: PlatformInput,
  options: { markVerified?: boolean } = {},
): Promise<LaunchAdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const validated = validatePlatformInput(input);
  if (!validated.ok) return validated;

  // `validatePlatformInput` has already normalised every JSON column.
  const row = {
    ...validated.row,
    ...(options.markVerified ? { verified_at: new Date().toISOString().slice(0, 10) } : {}),
  } as Database["public"]["Tables"]["launch_platforms"]["Insert"];
  const supabase = createServiceClient();
  const { error } = id
    ? await supabase.from("launch_platforms").update(row).eq("id", id)
    : await supabase.from("launch_platforms").insert(row);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A platform with that slug already exists." };
    if (error.code === "23514") return { ok: false, error: "The database rejected that combination (check automation level and URLs)." };
    return { ok: false, error: `Could not save: ${error.message}` };
  }
  console.info(JSON.stringify({ event: "launch_platform_saved", slug: row.slug, by: admin.actor, at: new Date().toISOString() }));
  refresh();
  return { ok: true, message: id ? "Platform updated." : "Platform added." };
}

export async function setLaunchPlatformActive(id: string, active: boolean): Promise<LaunchAdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown platform." };
  const { error } = await createServiceClient().from("launch_platforms").update({ active: Boolean(active) }).eq("id", id);
  if (error) return { ok: false, error: `Could not update: ${error.message}` };
  refresh();
  return { ok: true, message: active ? "Platform enabled." : "Platform disabled." };
}
