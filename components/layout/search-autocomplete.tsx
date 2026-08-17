"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { fetchSearchSuggestions } from "@/lib/actions/search";
import { countSuggestions, isSuggestable, type SearchSuggestions } from "@/lib/search";

const EMPTY: SearchSuggestions = { products: [], categories: [], makers: [] };

/** Long enough to skip most intermediate keystrokes, short enough to feel live. */
const DEBOUNCE_MS = 250;

type Option = { key: string; href: string; label: string };

/**
 * Navbar search with suggestions.
 *
 * One request per settled query, not per keystroke: the input debounces,
 * queries shorter than the useful minimum never leave the browser, and every
 * response is checked against the query that is current when it lands, so a
 * slow early request can't overwrite a newer one.
 *
 * Submitting always goes to /marketplace, so the full ranked result set stays
 * one Enter away whether or not anything is highlighted.
 */
export function SearchAutocomplete({
  className,
  tone = "dark",
  onNavigate,
}: {
  className?: string;
  /** "dark" is the navbar over the near-black bar; "light" is inside the
   * mobile menu sheet, which is a normal light popover surface. */
  tone?: "dark" | "light";
  /** Fired once a destination is chosen, so a host sheet can close itself. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const isDark = tone === "dark";
  const listboxId = useId();

  const [query, setQuery] = useState("");
  // The query is stored *with* its results so the panel can only ever show
  // suggestions that belong to the term currently being searched — otherwise a
  // slow response briefly renders the previous query's matches.
  const [result, setResult] = useState<{ query: string; data: SearchSuggestions }>({
    query: "",
    data: EMPTY,
  });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounced = useDebounce(query, DEBOUNCE_MS);
  const term = debounced.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived, not stored: a query too short to search has no suggestions by
  // definition, so there is nothing to clear.
  const suggestions = isSuggestable(term) && result.query === term ? result.data : EMPTY;

  // Flat list of everything shown, so arrow keys can walk across sections.
  const options: Option[] = [
    ...suggestions.products.map((p) => ({
      key: `p:${p.slug}`,
      href: `/products/${p.slug}`,
      label: p.name,
    })),
    ...suggestions.categories.map((c) => ({
      key: `c:${c.slug}`,
      href: `/categories/${c.slug}`,
      label: c.name,
    })),
    ...suggestions.makers.map((m) => ({
      key: `m:${m.username}`,
      href: `/marketplace?q=${encodeURIComponent(m.display_name)}`,
      label: m.display_name,
    })),
  ];

  useEffect(() => {
    if (!isSuggestable(term)) return;

    let current = true;
    fetchSearchSuggestions(term)
      .then((data) => {
        // Ignore a response whose query is no longer the one being searched.
        if (current) {
          setResult({ query: term, data });
          setActiveIndex(-1);
        }
      })
      .catch(() => {
        if (current) setResult({ query: term, data: EMPTY });
      });

    return () => {
      current = false;
    };
  }, [term]);

  // Close on outside click; Escape is handled on the input itself.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // The navbar advertises "/" as the shortcut, so make it work. Only the
  // navbar copy claims it, so only that instance binds it — two listeners
  // would fight over focus once the mobile menu is mounted.
  useEffect(() => {
    if (!isDark) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDark]);

  function goTo(href: string) {
    setOpen(false);
    setActiveIndex(-1);
    router.push(href);
    onNavigate?.();
  }

  function submit() {
    const term = query.trim();
    goTo(term ? `/marketplace?q=${encodeURIComponent(term)}` : "/marketplace");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => {
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        // Wrap, and treat -1 as "no selection, submit the raw query".
        if (next >= options.length) return -1;
        if (next < -1) return options.length - 1;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = activeIndex >= 0 ? options[activeIndex] : null;
      if (active) goTo(active.href);
      else submit();
    }
  }

  const showPanel = open && countSuggestions(suggestions) > 0;
  const activeKey = activeIndex >= 0 ? options[activeIndex]?.key : undefined;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Search
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2",
            isDark ? "text-white/40" : "text-muted",
          )}
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products..."
          aria-label="Search products"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listboxId : undefined}
          aria-activedescendant={activeKey ? `${listboxId}-${activeKey}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(
            "h-11 rounded-xl border pl-9 text-base outline-none transition-colors md:h-10 md:text-sm",
            isDark
              ? "w-56 border-white/15 bg-white/10 pr-9 text-white placeholder:text-white/40 focus-visible:border-primary/60"
              : "w-full border-border bg-background pr-3 text-ink placeholder:text-muted focus-visible:border-primary",
          )}
        />
        {/* The "/" hint is desktop-only — there's no physical key to press
            on the phone where the light variant renders. */}
        {isDark && (
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-white/15 bg-white/10 px-1.5 text-xs text-white/50">
            /
          </kbd>
        )}
      </form>

      {showPanel && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className={cn(
            "absolute top-full z-50 mt-2 max-h-[50dvh] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card py-1.5 shadow-[0_20px_50px_-20px_rgba(23,20,15,0.45)]",
            isDark ? "right-0 w-80" : "inset-x-0",
          )}
        >
          <Section title="Products">
            {suggestions.products.map((product) => (
              <Row
                key={product.slug}
                id={`${listboxId}-p:${product.slug}`}
                active={activeKey === `p:${product.slug}`}
                onSelect={() => goTo(`/products/${product.slug}`)}
              >
                {/* The stored name, never the normalised form. */}
                <span className="truncate font-medium text-ink">{product.name}</span>
                <span className="truncate text-xs text-muted">{product.tagline}</span>
              </Row>
            ))}
          </Section>

          <Section title="Categories">
            {suggestions.categories.map((category) => (
              <Row
                key={category.slug}
                id={`${listboxId}-c:${category.slug}`}
                active={activeKey === `c:${category.slug}`}
                onSelect={() => goTo(`/categories/${category.slug}`)}
              >
                <span className="truncate font-medium text-ink">{category.name}</span>
              </Row>
            ))}
          </Section>

          <Section title="Makers">
            {suggestions.makers.map((maker) => (
              <Row
                key={maker.username}
                id={`${listboxId}-m:${maker.username}`}
                active={activeKey === `m:${maker.username}`}
                onSelect={() =>
                  goTo(`/marketplace?q=${encodeURIComponent(maker.display_name)}`)
                }
              >
                <span className="truncate font-medium text-ink">{maker.display_name}</span>
                <span className="truncate text-xs text-muted">@{maker.username}</span>
              </Row>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

/** Renders nothing at all when its section is empty. */
function Section({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  id,
  active,
  onSelect,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      // mousedown, not click: the input's blur would close the panel first.
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
        active ? "bg-secondary-bg" : "hover:bg-secondary-bg/60",
      )}
    >
      {children}
    </button>
  );
}
