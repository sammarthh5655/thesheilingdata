import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADMIN_PATH, ADMIN_ID_SHA256, ADMIN_PASS_SHA256, sha256Hex } from '../../config.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { backend } from '../../backend/index.js'

export const ADMIN_GATE_KEY = 'tsd:adminGate'

export default function AdminLogin() {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { isSignedIn, isAdminRole } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const [idHash, passHash] = await Promise.all([sha256Hex(id), sha256Hex(password)])
      if (idHash !== ADMIN_ID_SHA256 || passHash !== ADMIN_PASS_SHA256) {
        setError('Invalid administrator credentials.')
        return
      }
      if (backend.mode !== 'local' && (!isSignedIn || !isAdminRole)) {
        setError(
          'Credentials accepted, but you must also be signed in to an account with the admin role. Sign in on the main site first.'
        )
        return
      }
      sessionStorage.setItem(ADMIN_GATE_KEY, '1')
      navigate(`/${ADMIN_PATH}/dashboard`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login-screen">
      <div className="auth-card" style={{ margin: 0 }}>
        <h1>Administration</h1>
        <p className="sub">Restricted area. This sign-in is separate from your site account.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="ad-id">Administrator ID</label>
            <input
              id="ad-id" required autoComplete="off"
              value={id} onChange={(e) => setId(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ad-pass">Password</label>
            <input
              id="ad-pass" type="password" required autoComplete="off"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
