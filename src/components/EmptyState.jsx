export default function EmptyState({ glyph = '◰', title, children }) {
  return (
    <div className="empty-state">
      <span className="glyph" aria-hidden="true">{glyph}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}
