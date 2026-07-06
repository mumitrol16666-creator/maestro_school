"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeMarkdownHref(href?: string) {
  if (!href) return undefined;
  const normalized = href.trim();
  if (/^(https?:|mailto:|tel:|\/)/i.test(normalized)) return normalized;
  return undefined;
}

export function MarkdownContent({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`space-y-3 text-sm leading-7 text-stone-500 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: content }) => <h2 className="font-display text-3xl text-ink">{content}</h2>,
          h2: ({ children: content }) => <h3 className="font-display text-2xl text-ink">{content}</h3>,
          h3: ({ children: content }) => <h4 className="font-display text-xl text-ink">{content}</h4>,
          strong: ({ children: content }) => <strong className="font-bold text-ink">{content}</strong>,
          a: ({ href, children: content }) => {
            const safeHref = safeMarkdownHref(href);
            if (!safeHref) return <span className="font-semibold text-ink">{content}</span>;
            return <a href={safeHref} target="_blank" rel="noreferrer" className="font-semibold text-gold underline">{content}</a>;
          },
          ul: ({ children: content }) => <ul className="list-disc space-y-1 pl-5">{content}</ul>,
          ol: ({ children: content }) => <ol className="list-decimal space-y-1 pl-5">{content}</ol>,
          blockquote: ({ children: content }) => <blockquote className="border-l-2 border-gold pl-4 italic">{content}</blockquote>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
