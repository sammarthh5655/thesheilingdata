import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const dest = location.state?.from || '/classes'

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await backend.signIn({ email, password })
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message || 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <h1>Welcome back</h1>
      <p className="sub">Sign in to browse worksheets and study material.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-pass">Password</label>
          <input
            id="login-pass" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <div className="hint"><Link to="/forgot-password">Forgot password?</Link></div>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="auth-alt">
        New here? <Link to="/signup">Create an account</Link>
      </div>
    </div>
  )
}
