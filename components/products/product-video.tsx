import { PlayCircle } from "lucide-react";

/**
 * Embeds a founder's demo video. Recognizes YouTube, Loom, and Vimeo and renders
 * a responsive 16:9 iframe; any other link degrades to a "Watch demo" button so
 * the URL is never lost. Server-safe (no hooks).
 */
function toEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
    const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  if (host === "loom.com") {
    const m = url.pathname.match(/\/(?:share|embed)\/([\w-]+)/);
    if (m) return `https://www.loom.com/embed/${m[1]}`;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }
  if (host === "player.vimeo.com") return raw;

  return null;
}

export function ProductVideo({ url }: { url: string | null }) {
  if (!url) return null;

  const embed = toEmbedUrl(url);

  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:border-primary/40 hover:text-primary"
      >
        <PlayCircle className="size-4" aria-hidden="true" />
        Watch demo video
      </a>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <iframe
        src={embed}
        title="Product demo video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="size-full"
      />
    </div>
  );
}
