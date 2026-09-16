"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Copilot.
 * A chat panel grounded in this campaign. Answers come from the server action,
 * which reads the maker's own campaign — never from anything typed here. */

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { askLaunchCopilot } from "@/lib/actions/launch-agent";
import { COPILOT_MAX_MESSAGE, COPILOT_STARTERS, type CopilotReply } from "@/lib/launch-agent/copilot";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

type Message = { id: number; role: "user" | "copilot"; text: string; reply?: CopilotReply; error?: boolean };

export function LaunchCopilot({ productId, productName }: { productId: string; productName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "copilot",
      text: `Hi! I'm Launch Copilot. I answer from ${productName}'s listing and launch campaign — ask where to launch, what's missing, or for better copy.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending]);

  function ask(raw: string) {
    const text = raw.trim().slice(0, COPILOT_MAX_MESSAGE);
    if (!text || pending) return;
    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text }]);
    setInput("");
    startTransition(async () => {
      try {
        const result = await askLaunchCopilot(productId, text);
        setMessages((prev) => [
          ...prev,
          result.ok
            ? { id: nextId.current++, role: "copilot", text: result.reply.text, reply: result.reply }
            : { id: nextId.current++, role: "copilot", text: result.error, error: true },
        ]);
      } catch {
        setMessages((prev) => [...prev, { id: nextId.current++, role: "copilot", text: "Launch Copilot couldn't answer right now. Try again.", error: true }]);
      }
    });
  }

  const lastSuggestions = [...messages].reverse().find((message) => message.reply)?.reply?.suggestions;
  const suggestions = lastSuggestions && lastSuggestions.length > 0 ? lastSuggestions : COPILOT_STARTERS.slice(0, 4);

  return (
    <section aria-labelledby="copilot-title" className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <header className="flex items-center gap-3 border-b border-border bg-surface-dark px-5 py-4 text-on-dark">
        <span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)]">
          <Bot className="size-5 text-white" aria-hidden="true" />
        </span>
        <div>
          <h2 id="copilot-title" className="text-base font-bold text-white">Launch Copilot</h2>
          <p className="text-xs text-white/60">Grounded in your listing and campaign</p>
        </div>
      </header>

      <div ref={listRef} className="flex max-h-[28rem] min-h-64 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                message.role === "user" ? "bg-primary text-white" : message.error ? "bg-destructive/10 text-destructive" : "bg-secondary-bg text-ink",
              )}
            >
              <p className="whitespace-pre-line break-words">{message.text}</p>
              {message.reply?.blocks.map((block, index) => (
                <div key={index} className="mt-2.5 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-muted">{block.label}</p>
                    <CopyButton text={block.text} className="shrink-0" />
                  </div>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-ink">{block.text}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-secondary-bg px-3.5 py-3" aria-label="Launch Copilot is thinking">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none" style={{ animationDelay: `${dot * 120}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 [scrollbar-width:none]">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => ask(suggestion)}
            disabled={pending}
            className="min-h-9 shrink-0 rounded-full border border-border bg-background px-3 text-xs font-medium text-ink transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50 pointer-coarse:min-h-11"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <label htmlFor="copilot-input" className="sr-only">Ask Launch Copilot</label>
        <input
          id="copilot-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={COPILOT_MAX_MESSAGE}
          placeholder="Ask about your launch…"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <Button type="submit" size="icon-lg" disabled={pending || !input.trim()} aria-label="Send">
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}
