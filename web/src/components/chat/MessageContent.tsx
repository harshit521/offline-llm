import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders assistant messages as Markdown.
 * Supports headings, paragraphs, lists, tables, code blocks, links, etc.
 * Incomplete Markdown during streaming is handled gracefully.
 */
export interface MessageContentProps {
  content?: string | null
  className?: string
}

/**
 * Renders Markdown content safely.
 * Shows a placeholder when content is null/empty (e.g., during streaming).
 */
export function MessageContent({
  content,
  className,
}: MessageContentProps) {
  if (!content) {
    return (
      <div className="prose-local whitespace-pre-wrap text-[15px] leading-7 text-[var(--muted)]">
        —
      </div>
    )
  }

  return (
    <div className="prose-local whitespace-pre-wrap text-[15px] leading-7">
      <ReactMarkdown
        // @ts-ignore - ReactMarkdown component props
        components={{
          code({ className, children }) {
            return (
              <pre
                className={className}
                style={{
                  overflowX: 'auto',
                  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  fontSize: '12px',
                  padding: '12px',
                  background: 'var(--surface-2)',
                  borderRadius: '4px',
                  margin: 0,
                }}
              >
                <code style={{ color: 'var(--text)', fontSize: '12px', display: 'block' }}>
                  {children}
                </code>
              </pre>
            )
          },
        }}
      />
    </div>
  )
}