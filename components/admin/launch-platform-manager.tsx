"use client";

/* Design system: design.md (Bharat Hunt — orange) · /admin/launch-agent
 *
 * The platform registry editor. An internal tool, styled like one: dense rows
 * and a full editor in a sheet. JSON columns are edited as JSON, validated by
 * the same `validatePlatformInput` the server applies, so a typo is caught in
 * the form rather than by a maker's broken card. Nothing here authorizes
 * anything; every action re-checks admin status on the server.
 */

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { saveLaunchPlatform, setLaunchPlatformActive } from "@/lib/actions/launch-agent-admin";
import { KNOWN_ADAPTER_KEYS } from "@/lib/launch-agent/adapters";
import { validatePlatformInput, type LaunchPlatformRow, type PlatformInput } from "@/lib/launch-agent/registry";
import { AUTOMATION_META } from "@/lib/launch-agent/status";
import { AUTOMATION_LEVELS, CONTENT_STYLES, PLATFORM_CATEGORIES } from "@/lib/launch-agent/types";
import { cn } from "@/lib/utils";

const EMPTY: PlatformInput = {
  slug: "",
  name: "",
  description: "",
  websiteUrl: "https://",
  submissionUrl: "",
  guidelinesUrl: "",
  category: "launch_platform",
  automationLevel: "AI_PREPARED",
  apiSupported: false,
  requiresUserAction: true,
  active: true,
  requirementsJson: '[\n  {"key": "website_url", "label": "Product URL", "required": true}\n]',
  supportedProductTypes: "",
  audienceTags: "",
  fitRulesJson: "{}",
  contentStyle: "directory",
  launchRulesJson: '{"phase": 2}',
  instructions: "",
  adapter: "default",
  priority: 100,
};

function toInput(row: LaunchPlatformRow): PlatformInput {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    websiteUrl: row.website_url,
    submissionUrl: row.submission_url ?? "",
    guidelinesUrl: row.guidelines_url ?? "",
    category: row.category,
    automationLevel: row.automation_level,
    apiSupported: row.api_supported,
    requiresUserAction: row.requires_user_action,
    active: row.active,
    requirementsJson: JSON.stringify(row.requirements ?? [], null, 2),
    supportedProductTypes: (row.supported_product_types ?? []).join(", "),
    audienceTags: (row.audience_tags ?? []).join(", "),
    fitRulesJson: JSON.stringify(row.fit_rules ?? {}, null, 2),
    contentStyle: row.content_style,
    launchRulesJson: JSON.stringify(row.launch_rules ?? {}, null, 2),
    instructions: row.instructions ?? "",
    adapter: row.adapter ?? "default",
    priority: row.priority,
  };
}

const selectClass = "min-h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm";

export function LaunchPlatformManager({ rows }: { rows: LaunchPlatformRow[] }) {
  const [editing, setEditing] = useState<{ id: string | null; input: PlatformInput } | null>(null);
  const [markVerified, setMarkVerified] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const clientCheck = useMemo(() => (editing ? validatePlatformInput(editing.input) : null), [editing]);

  function update<K extends keyof PlatformInput>(key: K, value: PlatformInput[K]) {
    setEditing((current) => (current ? { ...current, input: { ...current.input, [key]: value } } : current));
  }

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const result = await saveLaunchPlatform(editing.id, editing.input, { markVerified });
      setMessage(result.ok ? { ok: true, text: result.message ?? "Saved." } : { ok: false, text: result.error });
      if (result.ok) setEditing(null);
    });
  }

  function toggle(row: LaunchPlatformRow) {
    startTransition(async () => {
      const result = await setLaunchPlatformActive(row.id, !row.active);
      setMessage(result.ok ? { ok: true, text: result.message ?? "Updated." } : { ok: false, text: result.error });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          {rows.length} platforms · {rows.filter((row) => row.active).length} active. Mark a platform AUTOMATED only when an approved
          API permits the operation and an adapter implements it.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setMarkVerified(false);
            setEditing({ id: null, input: EMPTY });
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> Add platform
        </Button>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-sm", message.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Automation</th>
              <th className="px-3 py-2 font-medium">Style</th>
              <th className="px-3 py-2 font-medium">Verified</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={cn(!row.active && "opacity-60")}>
                <td className="px-3 py-2 font-mono text-xs">{row.priority}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold text-ink">{row.name}</p>
                  <a href={row.submission_url ?? row.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
                    {row.slug} <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </td>
                <td className="px-3 py-2 text-xs">{AUTOMATION_META[row.automation_level as keyof typeof AUTOMATION_META]?.label ?? row.automation_level}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.content_style}</td>
                <td className="px-3 py-2 text-xs text-muted">{row.verified_at ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.active}
                    aria-label={`${row.active ? "Disable" : "Enable"} ${row.name}`}
                    disabled={pending}
                    onClick={() => toggle(row)}
                    className={cn("relative h-6 w-11 rounded-full transition-colors", row.active ? "bg-primary" : "bg-secondary-bg")}
                  >
                    <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", row.active ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMarkVerified(false);
                      setEditing({ id: row.id, input: toInput(row) });
                    }}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="right" className="w-full bg-background p-0 sm:max-w-2xl data-[side=right]:sm:max-w-2xl">
          {editing && (
            <form
              className="flex flex-col gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <SheetHeader className="p-0 pr-10">
                <SheetTitle className="text-lg font-bold text-ink">{editing.id ? `Edit ${editing.input.name}` : "Add platform"}</SheetTitle>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><Input value={editing.input.name} onChange={(e) => update("name", e.target.value)} required /></Field>
                <Field label="Slug"><Input value={editing.input.slug} onChange={(e) => update("slug", e.target.value)} required /></Field>
                <Field label="Website URL"><Input value={editing.input.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} required /></Field>
                <Field label="Submission URL"><Input value={editing.input.submissionUrl} onChange={(e) => update("submissionUrl", e.target.value)} /></Field>
                <Field label="Guidelines URL"><Input value={editing.input.guidelinesUrl} onChange={(e) => update("guidelinesUrl", e.target.value)} /></Field>
                <Field label="Priority (lower first)"><Input type="number" min={0} max={1000} value={editing.input.priority} onChange={(e) => update("priority", Number(e.target.value))} /></Field>
                <Field label="Automation level">
                  <select className={selectClass} value={editing.input.automationLevel} onChange={(e) => update("automationLevel", e.target.value)}>
                    {AUTOMATION_LEVELS.map((level) => <option key={level} value={level}>{level} — {AUTOMATION_META[level].label}</option>)}
                  </select>
                </Field>
                <Field label="Category">
                  <select className={selectClass} value={editing.input.category} onChange={(e) => update("category", e.target.value)}>
                    {PLATFORM_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Content style">
                  <select className={selectClass} value={editing.input.contentStyle} onChange={(e) => update("contentStyle", e.target.value)}>
                    {CONTENT_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                  </select>
                </Field>
                <Field label="Adapter">
                  <select className={selectClass} value={editing.input.adapter} onChange={(e) => update("adapter", e.target.value)}>
                    {[...new Set([...KNOWN_ADAPTER_KEYS, editing.input.adapter])].map((key) => <option key={key} value={key}>{key}</option>)}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                {([
                  ["active", "Active"],
                  ["apiSupported", "Approved API available"],
                  ["requiresUserAction", "Final step needs the maker"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" className="size-4 accent-[#FF6B1A]" checked={editing.input[key]} onChange={(e) => update(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              <Field label="Description"><Textarea rows={2} value={editing.input.description} onChange={(e) => update("description", e.target.value)} /></Field>
              <Field label="Instructions shown to makers"><Textarea rows={3} value={editing.input.instructions} onChange={(e) => update("instructions", e.target.value)} /></Field>
              <Field label="Audience tags (comma-separated)" hint="e.g. saas, ai, developer, indie, consumer, open_source, india">
                <Input value={editing.input.audienceTags} onChange={(e) => update("audienceTags", e.target.value)} />
              </Field>
              <Field label="Supported product categories (comma-separated, empty = any)">
                <Input value={editing.input.supportedProductTypes} onChange={(e) => update("supportedProductTypes", e.target.value)} />
              </Field>
              <Field label="Requirements (JSON array)" hint='[{"key":"logo","label":"Logo","required":true,"manual":false,"verified":true,"note":"…"}] — keys: website_url, name, tagline, description, logo, screenshots, video, github_url, maker_info, topics, first_comment, launch_story, reddit_post, title_format, launch_timing; any other key is a manual step.'>
                <Textarea rows={8} className="font-mono text-xs" value={editing.input.requirementsJson} onChange={(e) => update("requirementsJson", e.target.value)} />
              </Field>
              <Field label="Launch rules (JSON)" hint='{"phase": 1-5, "weekdays": [0-6, Sunday = 0], "note": "…"}'>
                <Textarea rows={3} className="font-mono text-xs" value={editing.input.launchRulesJson} onChange={(e) => update("launchRulesJson", e.target.value)} />
              </Field>
              <Field label="Fit rules (JSON)" hint='{"tagWeights": {"ai": 10}, "penalizeTags": {}, "requiredAnyTags": [], "requiresWebsite": false, "prefersEarlyStage": false, "assetSensitive": false}'>
                <Textarea rows={4} className="font-mono text-xs" value={editing.input.fitRulesJson} onChange={(e) => update("fitRulesJson", e.target.value)} />
              </Field>

              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[#FF6B1A]" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} />
                I checked this against the platform&apos;s own site today
              </label>

              {clientCheck && !clientCheck.ok && <p role="alert" className="text-sm text-destructive">{clientCheck.error}</p>}
              {message && !message.ok && <p role="alert" className="text-sm text-destructive">{message.text}</p>}

              <div className="flex gap-2">
                <Button type="submit" disabled={pending || (clientCheck !== null && !clientCheck.ok)}>{pending ? "Saving…" : "Save platform"}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-ink">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
