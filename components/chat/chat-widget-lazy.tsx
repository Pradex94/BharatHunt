"use client";

/**
 * The support assistant, loaded after the page it sits on.
 *
 * `ChatWidget` is mounted from the root layout, so it was part of the initial
 * client bundle on every route — the widget itself, framer-motion's
 * `AnimatePresence`, and the whole `lib/chatbot-knowledge` corpus (~8KB of
 * source) — all downloaded and hydrated before anyone had asked it anything.
 * None of that is needed to read a page.
 *
 * `ssr: false` is safe here and nowhere near a layout shift: both the launcher
 * and the panel are `position: fixed`, so they are outside flow and arriving a
 * beat late moves nothing. It also keeps the widget's markup out of the
 * prerendered HTML, which is bytes off the critical path of a document that is
 * now served straight from the CDN edge.
 *
 * This wrapper exists because `next/dynamic` with `ssr: false` cannot be called
 * from a Server Component, and `app/layout.tsx` is one.
 *
 * Nothing here is crawlable content — the assistant answers questions about the
 * platform from a fixed script. The pages it talks about are all server
 * rendered and linked from the footer and the nav.
 */

import dynamic from "next/dynamic";

const ChatWidget = dynamic(
  () => import("@/components/chat/chat-widget").then((m) => m.ChatWidget),
  { ssr: false },
);

export function ChatWidgetLazy() {
  return <ChatWidget />;
}
