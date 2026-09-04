"use client";

/* Design system: design.md (Bharat Hunt — orange) · /admin/investors
 *
 * The investor management table and its editor.
 *
 * An internal tool, and styled like one: dense rows, no motion, no marketing
 * voice. It reuses the app's primitives so it does not look like a different
 * product, but it is not trying to be beautiful — it is trying to let one person
 * enter forty investors without fighting the form.
 *
 * The editor is a Sheet rather than an inline row or a separate route: an
 * investor has fifteen fields, which does not fit a table row, and a route per
 * record would lose the list's scroll position on every save.
 *
 * Nothing here authorizes anything. Every action re-checks `getIsAdmin()` on the
 * server (lib/actions/admin-investors.ts); this component only decides what is
 * drawn for someone the page already let in.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Plus, Star, Trash2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createInvestor,
  deleteInvestor,
  setInvestorFlag,
  updateInvestor,
  type InvestorInput,
} from "@/lib/actions/admin-investors";
import { INVESTOR_SECTORS, INVESTOR_STAGES, INVESTOR_TYPES } from "@/lib/investors";
import type { AdminInvestorRow } from "@/services/investors";

/** The editor's own state: every field as a string, the way an input holds it. */
type Draft = {
  name: string;
  firmName: string;
  logoUrl: string;
  website: string;
  location: string;
  investorType: string;
  stages: string;
  sectors: string;
  portfolio: string;
  checkSizeMinInr: string;
  checkSizeMaxInr: string;
  thesis: string;
  email: string;
  linkedin: string;
  contactDetails: string;
  isFreePreview: boolean;
  isPublished: boolean;
  sortOrder: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  firmName: "",
  logoUrl: "",
  website: "",
  location: "",
  investorType: "",
  stages: "",
  sectors: "",
  portfolio: "",
  checkSizeMinInr: "",
  checkSizeMaxInr: "",
  thesis: "",
  email: "",
  linkedin: "",
  contactDetails: "",
  isFreePreview: false,
  isPublished: true,
  sortOrder: "0",
};

function toDraft(row: AdminInvestorRow): Draft {
  return {
    name: row.name,
    firmName: row.firmName ?? "",
    logoUrl: row.logoUrl ?? "",
    website: row.website ?? "",
    location: row.location ?? "",
    investorType: row.investorType ?? "",
    // Comma-separated, matching what `tags()` on the server accepts. A text
    // input is faster to fill than three multi-selects, and this is a tool used
    // by one person entering rows in bulk.
    stages: row.stages.join(", "),
    sectors: row.sectors.join(", "),
    portfolio: row.portfolio.join(", "),
    checkSizeMinInr: row.checkSizeMinInr === null ? "" : String(row.checkSizeMinInr),
    checkSizeMaxInr: row.checkSizeMaxInr === null ? "" : String(row.checkSizeMaxInr),
    thesis: row.thesis ?? "",
    email: row.email ?? "",
    linkedin: row.linkedin ?? "",
    contactDetails: row.contactDetails ?? "",
    isFreePreview: row.isFreePreview,
    isPublished: row.isPublished,
    sortOrder: String(row.sortOrder),
  };
}

function toInput(draft: Draft): InvestorInput {
  return { ...draft };
}

/** A labelled text field. `datalist` gives the vocabulary without enforcing it. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  options,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  options?: readonly string[];
  type?: string;
}) {
  const listId = options ? `list-${label.replace(/\W+/g, "-").toLowerCase()}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {options && (
        /* A datalist, not a select: the column is free text by design (see the
           note on `investor_type` in the migration), so the vocabulary should
           suggest rather than constrain. */
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** A checkbox row with a real 44px target. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function InvestorManager({ investors }: { investors: AdminInvestorRow[] }) {
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  /* Which row a delete is awaiting confirmation on. A two-step inline confirm
     rather than `window.confirm`, which is blocked in some embedded browsers
     and cannot be styled — and this deletes a row of the product's dataset. */
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Client-side filter over an already-loaded list. The whole table is in memory
  // (this is an admin page over a curated dataset, not the marketplace), so a
  // round trip per keystroke would be slower and no more correct.
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return investors;
    return investors.filter((row) =>
      [row.name, row.firmName, row.location, row.investorType]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(term)),
    );
  }, [investors, query]);

  const save = useCallback(() => {
    if (!editing) return;
    setError(null);

    startTransition(async () => {
      const result = editing.id
        ? await updateInvestor(editing.id, toInput(editing.draft))
        : await createInvestor(toInput(editing.draft));

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // `revalidatePath` in the action re-renders the server component that
      // feeds `investors`, so closing the panel is enough — there is no local
      // list to keep in step.
      setEditing(null);
    });
  }, [editing]);

  const remove = useCallback((id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvestor(id);
      if (!result.ok) setError(result.error);
      setConfirmingDelete(null);
    });
  }, []);

  const toggle = useCallback(
    (id: string, flag: "is_published" | "is_free_preview", value: boolean) => {
      setError(null);
      startTransition(async () => {
        const result = await setInvestorFlag(id, flag, value);
        if (!result.ok) setError(result.error);
      });
    },
    [],
  );

  const patch = (next: Partial<Draft>) =>
    setEditing((current) => (current ? { ...current, draft: { ...current.draft, ...next } } : current));

  const freeCount = investors.filter((row) => row.isFreePreview && row.isPublished).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-56 flex-1 items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, firm, location…"
            aria-label="Filter investors"
            className="h-auto border-none bg-transparent p-0 shadow-none pointer-coarse:h-auto focus-visible:ring-0"
          />
        </div>
        <Button type="button" onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}>
          <Plus className="size-4" aria-hidden="true" />
          Add investor
        </Button>
      </div>

      {/*
        The free-preview count, stated rather than enforced here. The *query*
        caps the free tier at INVESTOR_FREE_PREVIEW_LIMIT, so flagging more rows
        is harmless — but an admin who flags nine and sees four on the page
        deserves to know why before filing a bug.
      */}
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">{investors.length}</span> investors ·{" "}
        <span className="font-medium text-ink">{freeCount}</span> flagged as free preview (the page
        shows at most 4)
      </p>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-body">
          {investors.length === 0
            ? "No investors yet. Add the first one."
            : "No investors match that filter."}
        </p>
      ) : (
        /* One card per row rather than a `<table>`: fifteen columns do not fit a
           phone, and a horizontally scrolling admin table is a table nobody
           uses. Each card is self-contained and stacks. */
        <ul className={cn("flex flex-col gap-3", pending && "opacity-70")}>
          {visible.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-words text-ink">{row.name}</span>
                  {!row.isPublished && (
                    <Badge variant="outline" className="h-5 px-2 text-[11px] text-muted">
                      unpublished
                    </Badge>
                  )}
                  {row.isFreePreview && (
                    <Badge variant="default" className="h-5 px-2 text-[11px]">
                      free preview
                    </Badge>
                  )}
                  {row.isSample && (
                    <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                      sample
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-body">
                  {[row.firmName, row.investorType, row.location].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {[
                    row.stages.join(", ") || "no stages",
                    row.sectors.join(", ") || "no sectors",
                  ].join(" · ")}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={row.isPublished ? "Unpublish" : "Publish"}
                  title={row.isPublished ? "Unpublish" : "Publish"}
                  onClick={() => toggle(row.id, "is_published", !row.isPublished)}
                >
                  {row.isPublished ? (
                    <Eye className="size-4" aria-hidden="true" />
                  ) : (
                    <EyeOff className="size-4" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    row.isFreePreview ? "Remove from free preview" : "Mark as free preview"
                  }
                  title={row.isFreePreview ? "Remove from free preview" : "Mark as free preview"}
                  onClick={() => toggle(row.id, "is_free_preview", !row.isFreePreview)}
                >
                  <Star
                    className={cn("size-4", row.isFreePreview && "fill-primary text-primary")}
                    aria-hidden="true"
                  />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing({ id: row.id, draft: toDraft(row) })}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Button>
                {confirmingDelete === row.id ? (
                  <span className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => remove(row.id)}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${row.name}`}
                    onClick={() => setConfirmingDelete(row.id)}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit investor" : "Add investor"}</SheetTitle>
          </SheetHeader>

          {editing && (
            <form
              className="flex flex-col gap-4 px-4 pb-8"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <Field
                label="Name *"
                value={editing.draft.name}
                onChange={(name) => patch({ name })}
                placeholder="Fund or investor name"
              />
              <Field
                label="Firm"
                value={editing.draft.firmName}
                onChange={(firmName) => patch({ firmName })}
                hint="Only when it differs from the name above — leave blank for a fund."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Location"
                  value={editing.draft.location}
                  onChange={(location) => patch({ location })}
                  placeholder="Bengaluru, Karnataka"
                  hint="The part after the last comma becomes the location filter."
                />
                <Field
                  label="Investor type"
                  value={editing.draft.investorType}
                  onChange={(investorType) => patch({ investorType })}
                  options={INVESTOR_TYPES}
                  placeholder="Micro VC"
                />
              </div>

              <Field
                label="Investment stages"
                value={editing.draft.stages}
                onChange={(stages) => patch({ stages })}
                options={INVESTOR_STAGES}
                placeholder="Pre-Seed, Seed"
                hint="Comma-separated."
              />
              <Field
                label="Sectors"
                value={editing.draft.sectors}
                onChange={(sectors) => patch({ sectors })}
                options={INVESTOR_SECTORS}
                placeholder="SaaS, FinTech, AI"
                hint="Comma-separated."
              />
              <Field
                label="Portfolio"
                value={editing.draft.portfolio}
                onChange={(portfolio) => patch({ portfolio })}
                placeholder="Company One, Company Two"
                hint="Comma-separated."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Cheque size min (₹)"
                  type="number"
                  value={editing.draft.checkSizeMinInr}
                  onChange={(checkSizeMinInr) => patch({ checkSizeMinInr })}
                  placeholder="2500000"
                  hint="Whole rupees, not paise. 25 lakh = 2500000."
                />
                <Field
                  label="Cheque size max (₹)"
                  type="number"
                  value={editing.draft.checkSizeMaxInr}
                  onChange={(checkSizeMaxInr) => patch({ checkSizeMaxInr })}
                  placeholder="25000000"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Thesis</Label>
                <Textarea
                  value={editing.draft.thesis}
                  onChange={(event) => patch({ thesis: event.target.value })}
                  rows={4}
                  placeholder="What this investor says they back."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Website"
                  value={editing.draft.website}
                  onChange={(website) => patch({ website })}
                  placeholder="https://…"
                  hint="Must be http(s). Anything else is discarded."
                />
                <Field
                  label="Logo URL"
                  value={editing.draft.logoUrl}
                  onChange={(logoUrl) => patch({ logoUrl })}
                  placeholder="https://…"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Email"
                  type="email"
                  value={editing.draft.email}
                  onChange={(email) => patch({ email })}
                  placeholder="partners@example.com"
                />
                <Field
                  label="LinkedIn"
                  value={editing.draft.linkedin}
                  onChange={(linkedin) => patch({ linkedin })}
                  placeholder="https://linkedin.com/…"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Other contact details</Label>
                <Textarea
                  value={editing.draft.contactDetails}
                  onChange={(event) => patch({ contactDetails: event.target.value })}
                  rows={3}
                  placeholder="Pitch form link, office address, how they prefer to be approached."
                />
              </div>

              <Field
                label="Sort order"
                type="number"
                value={editing.draft.sortOrder}
                onChange={(sortOrder) => patch({ sortOrder })}
                hint="Lower sorts first, in the directory and in the free preview."
              />

              <div className="flex flex-col gap-1 rounded-2xl border border-border p-3">
                <Toggle
                  label="Published"
                  hint="Unpublished investors are hidden from the directory entirely."
                  checked={editing.draft.isPublished}
                  onChange={(isPublished) => patch({ isPublished })}
                />
                <Toggle
                  label="Free preview"
                  hint="Shown to everyone, signed in or not. Contact fields stay behind the paywall."
                  checked={editing.draft.isFreePreview}
                  onChange={(isFreePreview) => patch({ isFreePreview })}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={pending || !editing.draft.name.trim()}>
                  {pending ? "Saving…" : "Save investor"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
