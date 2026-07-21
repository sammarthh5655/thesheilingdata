import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { backend } from '../backend/index.js'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      await backend.signUp({ name, email, password })
      navigate('/verify-email', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="auth-card">
      <h1>Create your account</h1>
      <p className="sub">
        Students can browse everything. Teachers are authorized to upload by the
        school after signing up.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="su-name">Full name</label>
          <input
            id="su-name" required autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="su-email">Email</label>
          <input
            id="su-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="su-pass">Password</label>
          <input
            id="su-pass" type="password" required autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <div className="hint">At least 8 characters.</div>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <div className="auth-alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </div>
  )
}
