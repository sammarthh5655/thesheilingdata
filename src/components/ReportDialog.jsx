import { useState } from 'react'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function ReportDialog({ file, onClose }) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (!file) return null

  const submit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) { setError('Please describe the problem.'); return }
    setBusy(true); setError('')
    try {
      await backend.createReport({ file, user, reason })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not send the report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        {done ? (
          <>
            <h3 id="report-title">Report sent</h3>
            <p className="sub">
              Thank you — an administrator will review “{file.fileName}”.
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3 id="report-title">Report a problem</h3>
            <p className="sub">
              Flag “{file.fileName}” for review — wrong file, bad scan, incorrect
              subject, or anything else off.
            </p>
            {error && <div className="form-error">{error}</div>}
            <div className="field">
              <label htmlFor="report-reason">What's wrong?</label>
              <textarea
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. This is the Class 8 worksheet, not Class 9"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
