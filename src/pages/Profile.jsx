import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function Profile() {
  const { user, refreshProfile, canUpload } = useAuth()
  const p = user.profile
  const [name, setName] = useState(p?.name || '')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPass, setNewPass] = useState('')

  const saveName = async (e) => {
    e.preventDefault()
    setMsg(''); setError('')
    if (name.trim().length < 2) { setError('Please enter your full name.'); return }
    setBusy(true)
    try {
      await backend.updateName(name)
      await refreshProfile()
      setMsg('Name updated.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setMsg(''); setError('')
    if (newPass.length < 8) { setError('New password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      await backend.changePassword(newPass)
      setNewPass('')
      setMsg('Password changed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const sendReset = async () => {
    setMsg(''); setError(''); setBusy(true)
    try {
      await backend.resetPassword(p.email)
      setMsg('Password reset email sent — check your inbox.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>My account</h1>
        <p className="sub">
          <span className={`badge ${p?.role}`}>{p?.role}</span>{' '}
          {p?.verified
            ? <span className="badge ok">verified</span>
            : <span className="badge pending">unverified</span>}
        </p>
      </div>

      {msg && <div className="form-success" role="status">{msg}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="panel">
        <h3>Details</h3>
        <form onSubmit={saveName} style={{ maxWidth: 420 }}>
          <div className="field">
            <label htmlFor="pr-name">Full name</label>
            <input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={p?.email || ''} disabled />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>Save changes</button>
        </form>
        <dl style={{ marginTop: '1.25rem' }} className="text-muted">
          <div>Member since: {formatDateTime(p?.createdAt)}</div>
          <div>Last sign-in: {formatDateTime(p?.lastLoginAt)}</div>
        </dl>
      </div>

      {!p?.verified && (
        <div className="panel">
          <h3>Email verification</h3>
          <p className="text-muted">Your email isn't verified yet.</p>
          <Link to="/verify-email" className="btn">Verify now</Link>
        </div>
      )}

      {canUpload && (
        <div className="panel">
          <h3>Teaching</h3>
          <p className="text-muted">
            You're authorized to upload worksheets. Your public page lists everything you've shared.
          </p>
          <Link to={`/teacher/${user.uid}`} className="btn">View my public teacher page</Link>
        </div>
      )}

      <div className="panel">
        <h3>Password</h3>
        {backend.mode === 'local' ? (
          <form onSubmit={changePassword} style={{ maxWidth: 420 }}>
            <div className="field">
              <label htmlFor="pr-pass">New password</label>
              <input
                id="pr-pass" type="password" autoComplete="new-password"
                value={newPass} onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>Change password</button>
          </form>
        ) : (
          <>
            <p className="text-muted">We'll email you a secure link to set a new password.</p>
            <button className="btn" onClick={sendReset} disabled={busy}>Send password reset email</button>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Session</h3>
        <button className="btn btn-danger" onClick={() => backend.signOutUser()}>Sign out</button>
      </div>
    </>
  )
}
