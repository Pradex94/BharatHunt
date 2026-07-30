/**
 * Renders one or more schema.org JSON-LD objects as a `<script>` tag. `<` is
 * escaped so structured-data values can never break out of the script element.
 * Server-safe (no client hooks) — drop it anywhere in a Server Component tree.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
