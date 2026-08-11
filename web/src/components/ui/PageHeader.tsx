import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="border-b rule px-7 py-7 lg:px-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          {eyebrow && (
            <div className="editorial-label">
              {eyebrow}
            </div>
          )}

          <h1 className="page-title mt-2">
            {title}
          </h1>

          {subtitle && (
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
              {subtitle}
            </p>
          )}
        </div>

        {action}
      </div>
    </header>
  )
}