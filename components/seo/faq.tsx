import { JsonLd } from "@/components/seo/json-ld";
import { faqSchema } from "@/lib/seo";

export type FaqItem = { question: string; answer: string };

/**
 * A visible FAQ section and its `FAQPage` JSON-LD, from one array.
 *
 * Same contract as `Breadcrumbs`, for the same reason and with sharper stakes:
 * FAQ rich results are the structured data Google most often penalises, and
 * almost always because the markup describes questions the page does not
 * actually show. Making the schema a by-product of rendering the content means
 * the failure mode cannot occur — there is no way to call this component and
 * get schema without text.
 *
 * `<details>` rather than a React accordion: it collapses without JavaScript, so
 * the answers are in the server-rendered HTML whether or not a crawler runs
 * scripts, and there is no hydration cost on a page whose job is to be read.
 *
 * Pass an empty array and nothing is emitted at all. A page with no genuine
 * questions gets no FAQPage node, which is the whole rule.
 */
export function Faq({
  items,
  heading = "Frequently asked questions",
  className,
}: {
  items: FaqItem[];
  heading?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className} aria-labelledby="faq-heading">
      <JsonLd data={faqSchema(items)} />
      <h2 id="faq-heading" className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {heading}
      </h2>
      <div className="mt-5 flex flex-col divide-y divide-border border-y border-border">
        {items.map((item) => (
          <details key={item.question} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink marker:hidden">
              {item.question}
              <span
                aria-hidden="true"
                className="shrink-0 text-lg leading-none text-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2.5 text-sm leading-relaxed text-body">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
