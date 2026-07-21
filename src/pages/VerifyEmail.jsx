import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function VerifyEmail() {
  const { user, isSignedIn, isVerified, refreshProfile } = useAuth()
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  if (!isSignedIn) {
    return (
      <div className="auth-card">
        <h1>Verify your email</h1>
        <p className="sub">Sign in first, then verify your email address.</p>
        <Link to="/login" className="btn btn-primary btn-block">Sign in</Link>
      </div>
    )
  }

  if (isVerified) {
    return (
      <div className="auth-card">
        <h1>You're verified ✓</h1>
        <p className="sub">Your email address is confirmed — your account is fully active.</p>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/classes')}>
          Browse classes
        </button>
      </div>
    )
  }

  const resend = async () => {
    setMsg(''); setError(''); setBusy(true)
    try {
      await backend.resendVerification()
      setMsg('Verification email sent — check your inbox (and spam folder).')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    setMsg(''); setError(''); setBusy(true)
    try {
      const ok = await backend.reloadVerification()
      await refreshProfile()
      setMsg(ok ? 'Verified! Your account is fully active.' : 'Not verified yet — click the link in the email first.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const simulate = async () => {
    setMsg(''); setError(''); setBusy(true)
    try {
      await backend.simulateVerify()
      await refreshProfile()
      setMsg('Marked as verified (local preview).')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <h1>Verify your email</h1>
      <p className="sub">
        We sent a verification link to <b>{user?.profile?.email}</b>. You can
        browse while unverified, but please verify to fully activate your account.
      </p>
      {msg && <div className="form-success" role="status">{msg}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <button className="btn btn-primary" onClick={check} disabled={busy}>
          I've clicked the link — check again
        </button>
        <button className="btn" onClick={resend} disabled={busy}>
          Resend verification email
        </button>
        {backend.mode === 'local' && (
          <button className="btn" onClick={simulate} disabled={busy}>
            Mark as verified (local preview only)
          </button>
        )}
      </div>
    </div>
  )
}
