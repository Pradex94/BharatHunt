"use client";

/* Design system: design.md (Bharat Hunt — orange) · floating support assistant.
 * A free, curated chatbot (no API) that answers questions about the platform
 * from lib/chatbot-knowledge. Floating orange bubble opens a chat panel with
 * tappable starter questions and free-text keyword matching. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bot, MessageCircle, Send, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { findAnswer, STARTERS, type ChatLink } from "@/lib/chatbot-knowledge";

type Msg = { id: string; role: "bot" | "user"; text: string; links?: ChatLink[] };

const WELCOME: Msg = {
  id: "welcome",
  role: "bot",
  text: "Hi! 👋 I'm the Bharat Hunt assistant. Ask me anything about the platform — or tap a question below to get started.",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the newest message in view (DOM side effect — not setState).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  // Focus the input whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clear a pending "typing" timer on unmount.
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function send(raw: string) {
    const text = raw.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setTyping(true);

    const entry = findAnswer(text);
    timeoutRef.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "bot", text: entry.a, links: entry.links },
      ]);
      setTyping(false);
    }, 450);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Bharat Hunt assistant"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            className="fixed right-4 bottom-[calc(6rem+var(--bh-consent-h,0px))] z-50 flex h-[70dvh] max-h-[560px] w-[calc(100dvw-2rem)] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-hover sm:right-6 sm:w-[380px]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-dark px-4 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white">
                <Bot className="size-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Bharat Hunt Assistant</p>
                <p className="text-xs text-white/60">Ask about the platform</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex size-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
              {typing && <TypingIndicator />}
              <div ref={endRef} />
            </div>

            {/* Starter chips */}
            <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2.5">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap text-body transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question…"
                aria-label="Type your question"
                className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-base text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-primary sm:h-10 sm:text-sm"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!input.trim()}
                className="btn-gradient flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
              >
                <Send className="size-5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        className="btn-gradient fixed right-4 bottom-[calc(1.5rem+var(--bh-consent-h,0px))] z-50 flex size-14 items-center justify-center rounded-full transition-[bottom] duration-200 ease-out sm:right-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="size-6" />
            </motion.span>
          ) : (
            <motion.span
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="size-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isBot = msg.role === "bot";
  return (
    <div className={cn("flex", isBot ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isBot ? "rounded-tl-sm bg-secondary-bg text-body" : "rounded-tr-sm bg-ink text-white",
        )}
      >
        <p className="whitespace-pre-wrap">{msg.text}</p>
        {msg.links && msg.links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.links.map((link) => (
              <LinkChip key={link.href} link={link} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LinkChip({ link }: { link: ChatLink }) {
  const className =
    "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20";
  const label = (
    <>
      {link.label}
      <ArrowRight className="size-3" />
    </>
  );
  return link.href.startsWith("/") ? (
    <Link href={link.href} className={className}>
      {label}
    </Link>
  ) : (
    <a href={link.href} className={className}>
      {label}
    </a>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-secondary-bg px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
