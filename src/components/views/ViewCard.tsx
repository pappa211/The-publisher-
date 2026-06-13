import type { ReactNode } from 'react'

/** Consistent shell for every report view: title, description, controls, body. */
export function ViewCard({
  title,
  description,
  controls,
  footnote,
  children,
}: {
  title: string
  description?: string
  controls?: ReactNode
  footnote?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="view-card">
      <header className="view-card__head">
        <div className="view-card__heading">
          <h3 className="view-card__title">{title}</h3>
          {description && <p className="view-card__desc">{description}</p>}
        </div>
        {controls && <div className="view-card__controls">{controls}</div>}
      </header>
      <div className="view-card__body">{children}</div>
      {footnote && <p className="view-card__foot">{footnote}</p>}
    </section>
  )
}

/** Friendly placeholder shown when a view has nothing to render. */
export function ViewEmpty({ children }: { children: ReactNode }) {
  return <div className="view-empty">{children}</div>
}
