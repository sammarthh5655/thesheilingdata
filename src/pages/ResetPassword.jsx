import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'

// Landing page for the password-reset email link. Clicking the link signs the
// user in with a short-lived recovery session; here they choose a new password.
export default function ResetPassword() {
  const { isSignedIn, loading } = useAuth()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pass.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (pass !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    try {
      await backend.changePassword(pass)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not update the password.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="auth-card"><p className="sub">Loading…</p></div>

  if (done) {
    return (
      <div className="auth-card">
        <h1>Password updated ✓</h1>
        <p className="sub">Your password has been changed. You can sign in with it now.</p>
        <button
          className="btn btn-primary btn-block"
          onClick={async () => { await backend.signOutUser(); navigate('/login', { replace: true }) }}
        >
          Go to sign in
        </button>
      </div>
    )
  }

  // Reached without a valid recovery session (link expired, opened directly,
  // or already used). Send them back to request a fresh link.
  if (!isSignedIn) {
    return (
      <div className="auth-card">
        <h1>Reset link expired</h1>
        <p className="sub">
          This password-reset link is invalid or has already been used. Request a
          new one and use the most recent email.
        </p>
        <Link to="/forgot-password" className="btn btn-primary btn-block">Request a new link</Link>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1>Set a new password</h1>
      <p className="sub">Choose a new password for your account.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="rp-pass">New password</label>
          <input
            id="rp-pass" type="password" required autoComplete="new-password"
            value={pass} onChange={(e) => setPass(e.target.value)}
          />
          <div className="hint">At least 8 characters.</div>
        </div>
        <div className="field">
          <label htmlFor="rp-confirm">Confirm new password</label>
          <input
            id="rp-confirm" type="password" required autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
