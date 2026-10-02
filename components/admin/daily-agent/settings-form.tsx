"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { queueDailyAgentUrls, saveDailyAgentSettings, type SettingsInput } from "@/lib/actions/daily-agent-admin";
import { cn } from "@/lib/utils";

export type SourceOption = { key: string; name: string; description: string };

const WEIGHT_LABELS: Record<string, string> = {
  india: "India relevance",
  completeness: "Completeness",
  website: "Website quality",
  uniqueness: "Uniqueness",
  launchReadiness: "Launch readiness",
  relevance: "BharatHunt relevance",
};

const input = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ink";

export function DailyAgentSettingsForm({
  initial,
  sources,
  aiEnabled,
}: {
  initial: SettingsInput;
  sources: SourceOption[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SettingsInput>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const number = (key: keyof SettingsInput, label: string, min: number, max: number, hint?: string) => (
    <label className="text-xs text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={form[key] as number}
        onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
        className={input}
      />
      {hint && <span className="mt-0.5 block text-[11px]">{hint}</span>}
    </label>
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveDailyAgentSettings(form);
          setMessage(result.ok ? { ok: true, text: result.message ?? "Saved." } : { ok: false, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-ink">Schedule and mode</legend>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Agent enabled (off = scheduled runs do nothing)
        </label>
        {number("dailyTarget", "Daily target", 1, 25)}
        <label className="text-xs text-muted">
          Run time (local)
          <input value={form.runTime} onChange={(e) => setForm({ ...form, runTime: e.target.value })} placeholder="09:00" className={input} />
        </label>
        <label className="text-xs text-muted">
          Timezone
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted">
          Mode
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={input}>
            <option value="approval">Approval (recommended)</option>
            <option value="auto_publish">Auto-publish</option>
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink sm:col-span-2 lg:col-span-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.autoPublishAllowed}
            onChange={(e) => setForm({ ...form, autoPublishAllowed: e.target.checked })}
          />
          <span>
            Auto-publish allowed — the kill switch. Untick it and nothing publishes without you, whatever the mode says.
            Even when allowed, only picks with no open issues, known pricing, a website the agent did not have to guess,
            and scores above both minimums go live on their own.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={form.notifyEnabled} onChange={(e) => setForm({ ...form, notifyEnabled: e.target.checked })} />
          Email the admins when a batch completes
        </label>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-ink">Quality bars</legend>
        {number("minIndiaConfidence", "Minimum India confidence", 0, 100, "Below it: needs review, never auto-published")}
        {number("minQualityScore", "Minimum quality score", 0, 100)}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-ink">Score weights</legend>
        {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
          <label key={key} className="text-xs text-muted">
            {label}
            <input
              type="number"
              min={0}
              max={100}
              value={form.weights[key] ?? 0}
              onChange={(e) => setForm({ ...form, weights: { ...form.weights, [key]: Number(e.target.value) } })}
              className={input}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Discovery sources</legend>
        {sources.map((source) => (
          <label key={source.key} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.enabledSources.includes(source.key)}
              onChange={(e) =>
                setForm({
                  ...form,
                  enabledSources: e.target.checked
                    ? [...form.enabledSources, source.key]
                    : form.enabledSources.filter((key) => key !== source.key),
                })
              }
            />
            <span>
              <span className="font-semibold">{source.name}</span>
              <span className="block text-xs text-muted">{source.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-ink">Resource limits</legend>
        {number("maxDiscoveryCandidates", "Max discovery candidates", 1, 200)}
        {number("maxSitesPerBatch", "Max websites fetched per batch", 1, 100, "Each site is up to 3 pages")}
        {number("maxConcurrentRequests", "Max concurrent requests", 1, 8)}
        {number("requestTimeoutMs", "Request timeout (ms)", 1000, 20000)}
        {number("cacheTtlDays", "Cache TTL (days)", 1, 365, "A verified site is reused, not refetched")}
        {number(
          "maxAiCalls",
          "Max AI calls per batch",
          0,
          100,
          aiEnabled ? "Model pass is configured" : "No ANTHROPIC_API_KEY — no calls are made; drafts come from verified facts",
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-gradient inline-flex min-h-11 items-center rounded-md px-5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && <p className={cn("text-sm", message.ok ? "text-success" : "text-error")}>{message.text}</p>}
      </div>
    </form>
  );
}

export function DailyAgentUrlQueue({ queued }: { queued: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={"https://example.in\nhttps://another-product.com"}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await queueDailyAgentUrls(text);
              setMessage(result.ok ? { ok: true, text: result.message ?? "Queued." } : { ok: false, text: result.error });
              if (result.ok) {
                setText("");
                router.refresh();
              }
            })
          }
          className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink hover:border-primary/30 hover:bg-secondary-bg disabled:opacity-60"
        >
          Queue for next run
        </button>
        {message && <p className={cn("text-sm", message.ok ? "text-success" : "text-error")}>{message.text}</p>}
      </div>
      {queued.length > 0 && (
        <p className="break-words text-xs text-muted">Queued ({queued.length}): {queued.join(" · ")}</p>
      )}
    </div>
  );
}
