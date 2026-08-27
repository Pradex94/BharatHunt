import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo";

export type Crumb = { name: string; path: string };

/**
 * The visible breadcrumb trail and its `BreadcrumbList` JSON-LD, from one array.
 *
 * Both halves are built here so they cannot drift. Emitting a breadcrumb trail
 * that does not match what a visitor can see is the kind of mismatch Google
 * treats as a structured-data violation, and the way that happens in practice is
 * never malice — it is a page whose markup moved while its schema helper stayed
 * where it was. One argument, one source.
 *
 * The last crumb is the current page: rendered as plain text rather than a link
 * to itself, but still present in the JSON-LD, which is what the spec asks for.
 *
 * Server component, no client JavaScript. A breadcrumb that needed hydration to
 * appear would be invisible in exactly the pass that matters.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length < 2) return null;

  return (
    <>
      <JsonLd data={breadcrumbSchema(items)} />
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRight size={12} className="shrink-0 text-border" aria-hidden="true" />
                )}
                {isLast ? (
                  <span aria-current="page" className="truncate text-body">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className="transition-colors hover:text-primary">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
