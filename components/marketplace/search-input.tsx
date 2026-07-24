"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";

export function SearchInput() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debouncedValue = useDebounce(value, 400);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    updateSearchParams({ q: debouncedValue.trim() || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div className="relative flex flex-1 items-center gap-2.5 rounded-md border border-border bg-background px-4 py-2.5 transition-colors focus-within:border-primary">
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search products, tags, or makers…"
        aria-label="Search products"
        className="h-auto border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
