"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Kit.
 * Every draft with Copy / Edit, and a kit-wide Regenerate. Edits are saved per
 * field and survive Regenerate; "Use generated" drops an edit. */

import { useState, type ReactElement, type ReactNode } from "react";
import { Pencil, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { regenerateLaunchKit, saveLaunchKitField } from "@/lib/actions/launch-agent";
import { KIT_FIELD_LABELS } from "@/lib/launch-agent/content";
import type { LaunchKit } from "@/lib/launch-agent/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import type { useLaunchAction } from "./use-launch-action";

type Runner = ReturnType<typeof useLaunchAction>;

function asText(value: LaunchKit[keyof LaunchKit], field: keyof LaunchKit): string {
  if (!Array.isArray(value)) return value;
  if (field === "xThread") return value.join("\n\n");
  if (field === "submissionNotes") return value.map((note) => `• ${note}`).join("\n");
  return value.join(field === "hashtags" ? " " : ", ");
}

function editText(value: LaunchKit[keyof LaunchKit], field: keyof LaunchKit): string {
  if (!Array.isArray(value)) return value;
  return value.join(field === "xThread" ? "\n\n" : "\n");
}

/**
 * `**bold**` within one line, as React nodes. The templates in
 * lib/launch-agent/content.ts are the only source of this markup (Product
 * Hunt's maker comment, e.g. "**Why I built it**"), so this only ever has to
 * handle one construct, not general Markdown.
 */
function renderInline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/**
 * The preview for a multiline field: `## Heading` lines (launchStory's
 * section breaks) become their own bold line instead of showing the literal
 * `##`; everything else keeps the original whitespace-pre-line paragraph
 * behaviour, including the blank lines between sections. The Copy button and
 * the edit textarea read the untouched source text — only this preview
 * renders it, because a maker pasting into Indie Hackers or Product Hunt
 * needs the real Markdown, not what this turns it into.
 */
function renderKitBlocks(text: string): ReactElement[] {
  const lines = text.split("\n");
  const blocks: ReactElement[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={blocks.length} className="whitespace-pre-line">
        {renderInline(paragraph.join("\n"))}
      </p>,
    );
    paragraph = [];
  };
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push(
        <p key={blocks.length} className="font-bold text-ink">
          {heading[1]}
        </p>,
      );
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export function LaunchKitView({
  productId,
  platformSlug,
  platformName,
  kit,
  editedFields,
  runner,
}: {
  productId: string;
  platformSlug: string;
  platformName: string;
  kit: LaunchKit;
  editedFields: string[];
  runner: Runner;
}) {
  const [editing, setEditing] = useState<keyof LaunchKit | null>(null);
  const [draft, setDraft] = useState("");
  const edited = new Set(editedFields);
  const allText = KIT_FIELD_LABELS.map(({ field, label }) => {
    const text = asText(kit[field], field);
    return text ? `${label.toUpperCase()}\n${text}` : null;
  })
    .filter(Boolean)
    .join("\n\n---\n\n");

  function startEdit(field: keyof LaunchKit) {
    setEditing(field);
    setDraft(editText(kit[field], field));
  }

  return (
    <section aria-labelledby={`kit-${platformSlug}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`kit-${platformSlug}`} className="text-base font-bold text-ink">
            Launch Kit for {platformName}
          </h3>
          <p className="text-xs text-muted">
            Drafted from your BharatHunt listing. Review, fill in any [bracketed prompts], then post.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={allText} label="Copy all" />
          <Button
            variant="outline"
            size="sm"
            disabled={runner.pending}
            onClick={() => runner.run(`regen-${platformSlug}`, () => regenerateLaunchKit(productId, platformSlug))}
          >
            <RefreshCw className={cn("size-3.5", runner.pendingKey === `regen-${platformSlug}` && "animate-spin")} aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {KIT_FIELD_LABELS.map(({ field, label, multiline }) => {
          const value = kit[field];
          const text = asText(value, field);
          if (!text && editing !== field) return null;
          const isEditing = editing === field;
          const saveKey = `save-${platformSlug}-${field}`;
          return (
            <li key={field} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  {label}
                  {edited.has(field) && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary normal-case">edited</span>}
                </p>
                {!isEditing && (
                  <div className="flex items-center gap-1.5">
                    <CopyButton text={text} label="Copy" />
                    <button
                      type="button"
                      onClick={() => startEdit(field)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-body hover:bg-secondary-bg hover:text-ink pointer-coarse:min-h-11"
                      aria-label={`Edit ${label}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" /> Edit
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="mt-2 flex flex-col gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={multiline ? 8 : 2}
                    maxLength={5000}
                    aria-label={`Edit ${label}`}
                    className="bg-background text-sm"
                  />
                  {Array.isArray(value) && (
                    <p className="text-xs text-muted">{field === "xThread" ? "Separate posts with a blank line." : "One item per line."}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={runner.pending}
                      onClick={() =>
                        runner.run(saveKey, () => saveLaunchKitField(productId, platformSlug, field, draft), () => setEditing(null))
                      }
                    >
                      {runner.pendingKey === saveKey ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    {edited.has(field) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={runner.pending}
                        onClick={() =>
                          runner.run(saveKey, () => saveLaunchKitField(productId, platformSlug, field, null), () => setEditing(null))
                        }
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" /> Use generated
                      </Button>
                    )}
                  </div>
                </div>
              ) : multiline ? (
                <div className="mt-1.5 flex flex-col gap-1.5 text-sm break-words text-ink leading-relaxed">
                  {renderKitBlocks(text)}
                </div>
              ) : (
                <p className="mt-1.5 text-sm break-words text-ink">{renderInline(text)}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
