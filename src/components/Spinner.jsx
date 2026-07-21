export default function Spinner({ label = 'Loading', small = false }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <div className={small ? 'spinner sm' : 'spinner'} />
      {label && <span>{label}…</span>}
    </div>
  )
}
