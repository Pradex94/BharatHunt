import { checkRateLimitByIp } from "@/lib/rate-limit";
import { AUTOMATION_META } from "@/lib/launch-agent/status";
import { getActivePlatforms, LaunchAgentNotConfiguredError } from "@/services/launch-agent";

/**
 * GET /api/launch-agent/platforms — the public platform directory.
 *
 * Only what describes the third-party sites: names, links, automation level and
 * requirements. Fit rules and adapter keys are internal tuning and stay out.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const limit = await checkRateLimitByIp("launchPlatformsApi");
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  }
  try {
    const platforms = await getActivePlatforms();
    return Response.json(
      {
        platforms: platforms.map((platform) => ({
          slug: platform.slug,
          name: platform.name,
          description: platform.description,
          websiteUrl: platform.websiteUrl,
          submissionUrl: platform.submissionUrl,
          guidelinesUrl: platform.guidelinesUrl,
          category: platform.category,
          automationLevel: platform.automationLevel,
          automationLabel: AUTOMATION_META[platform.automationLevel].label,
          requiresUserAction: platform.requiresUserAction,
          requirements: platform.requirements.map(({ label, required, manual, verified, note }) => ({ label, required, manual: Boolean(manual), verified: Boolean(verified), note: note ?? null })),
          verifiedAt: platform.verifiedAt,
        })),
      },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (error) {
    if (error instanceof LaunchAgentNotConfiguredError) return Response.json({ platforms: [] }, { status: 503 });
    console.error(JSON.stringify({ event: "launch_platforms_api_failed", message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Could not load platforms." }, { status: 500 });
  }
}
