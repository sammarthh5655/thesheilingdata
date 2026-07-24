import { Link } from 'react-router-dom'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { formatDateTime } from '../config.js'

export default function Settings() {
  const { user, role } = useAuth()
  const { theme, toggle } = useTheme()
  const p = user?.profile

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="sub">Appearance, account and app information.</p>
      </div>

      <div className="panel">
        <h3>Appearance</h3>
        <p className="text-muted">Choose how TheSheilingData looks on this device.</p>
        <div className="row" role="group" aria-label="Theme">
          <button
            className={theme === 'light' ? 'chip active' : 'chip'}
            onClick={() => theme !== 'light' && toggle()}
          >
            ☀ Light
          </button>
          <button
            className={theme === 'dark' ? 'chip active' : 'chip'}
            onClick={() => theme !== 'dark' && toggle()}
          >
            ☾ Dark
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Account</h3>
        <dl className="text-muted">
          <div>Name: <b>{p?.name || '—'}</b></div>
          <div>Email: <b>{p?.email || '—'}</b></div>
          <div>Role: <span className={`badge ${role}`}>{role}</span></div>
          <div>Status: {p?.verified
            ? <span className="badge ok">verified</span>
            : <span className="badge pending">unverified</span>}</div>
          <div>Member since: {formatDateTime(p?.createdAt)}</div>
        </dl>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <Link to="/profile" className="btn">Edit name &amp; password</Link>
          {!p?.verified && <Link to="/verify-email" className="btn">Verify email</Link>}
        </div>
      </div>

      <div className="panel">
        <h3>About TheSheilingData</h3>
        <p className="text-muted">
          An organized library of worksheets and previous-year question papers for
          classes 6–10 — created by Samarth Khandelwal. Found a bug or have a
          suggestion? Write to{' '}
          <a href="mailto:sammarth025@gmail.com">sammarth025@gmail.com</a>.
        </p>
      </div>

      <div className="panel">
        <h3>Session</h3>
        <button className="btn btn-danger" onClick={() => backend.signOutUser()}>Sign out</button>
      </div>
    </>
  )
}
