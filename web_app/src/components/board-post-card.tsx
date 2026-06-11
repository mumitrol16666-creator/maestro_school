"use client";

import { ChevronDown, ChevronUp, Newspaper } from "lucide-react";
import { useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import type { BoardPost } from "@/types";

const LONG_POST_CHARS = 420;

export function BoardPostCard({ post }: { post: BoardPost }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = post.content.trim().length > LONG_POST_CHARS;

  return (
    <article className="overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft">
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white"
            style={{ backgroundColor: post.accent }}
          >
            <Newspaper size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400">
              <span>{post.date}</span>
              <span>{post.author}</span>
            </div>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl">{post.title}</h2>
            <div className="relative mt-4">
              <div className={!expanded && isLong ? "max-h-56 overflow-hidden" : undefined}>
                <MarkdownContent>{post.content}</MarkdownContent>
              </div>
              {!expanded && isLong && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper via-paper/95 to-transparent"
                  aria-hidden
                />
              )}
            </div>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-ink transition hover:border-gold/40"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={16} />
                    Свернуть
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Читать полностью
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
