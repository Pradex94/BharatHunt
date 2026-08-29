"use client";

import { useState } from "react";
import { SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CategorySidebar } from "@/components/marketplace/category-sidebar";

export function MobileFilters({
  categoryCounts,
  totalCount,
}: {
  categoryCounts: Record<string, number>;
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="outline" className="shrink-0 gap-2 lg:hidden" />}
      >
        <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
        Filters
      </SheetTrigger>
      <SheetContent side="right" className="w-full">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <CategorySidebar categoryCounts={categoryCounts} totalCount={totalCount} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
