import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../backend/index.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  // Local-mode direct reset
  const [newPass, setNewPass] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setBusy(true)
    try {
      await backend.resetPassword(email)
      setSuccess('Password reset email sent — check your inbox (and spam folder).')
    } catch (err) {
      setError(err.message || 'Could not send the reset email.')
    } finally {
      setBusy(false)
    }
  }

  const directReset = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPass.length < 8) { setError('New password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      await backend.localDirectReset({ email, newPassword: newPass })
      setSuccess('Password updated. You can sign in with your new password now.')
      setNewPass('')
    } catch (err) {
      setError(err.message || 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <h1>Reset password</h1>
      <p className="sub">Enter your account email and we'll send you a reset link.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="form-success" role="status">{success}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="fp-email">Email</label>
          <input
            id="fp-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset email'}
        </button>
      </form>

      {backend.mode === 'local' && (
        <form onSubmit={directReset}>
          <div className="divider">local mode only</div>
          <p className="note mb-2">
            Local preview can't send email. Enter the email above and a new
            password here to reset directly (this browser only).
          </p>
          <div className="field">
            <label htmlFor="fp-new">New password</label>
            <input
              id="fp-new" type="password" autoComplete="new-password"
              value={newPass} onChange={(e) => setNewPass(e.target.value)}
            />
          </div>
          <button className="btn btn-block" type="submit" disabled={busy || !email}>
            Reset directly
          </button>
        </form>
      )}

      <div className="auth-alt">
        Remembered it? <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  )
}
