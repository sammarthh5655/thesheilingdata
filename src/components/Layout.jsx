import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { backend } from '../backend/index.js'

export default function Layout() {
  const { isSignedIn, isVerified, user } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const onSearch = (e) => {
    e.preventDefault()
    const query = q.trim()
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="wordmark" aria-label="TheSheilingData home">
            <span className="mark">SD</span>
            TheSheiling<em>Data</em>
          </Link>

          {isSignedIn && (
            <form className="header-search" role="search" onSubmit={onSearch}>
              <input
                type="search"
                placeholder="Search worksheets…"
                aria-label="Search worksheets"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </form>
          )}

          <nav className="site-nav" aria-label="Main">
            {isSignedIn ? (
              <>
                <NavLink to="/classes">Classes</NavLink>
                <NavLink to="/bookmarks">Bookmarks</NavLink>
                <NavLink to="/profile">{user?.profile?.name?.split(' ')[0] || 'Profile'}</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/signup" className="btn btn-primary btn-sm" style={{ marginLeft: 4 }}>
                  Create account
                </NavLink>
              </>
            )}
            <button
              className="theme-toggle"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </nav>
        </div>
      </header>

      {isSignedIn && !isVerified && (
        <div className="banner warn" role="status">
          <span>Please verify your email address to fully activate your account.</span>
          <Link to="/verify-email" className="btn btn-sm">Verify email</Link>
        </div>
      )}

      {backend.mode === 'local' && (
        <div className="banner" role="note">
          <span>
            Running in <b>local preview mode</b> — data stays in this browser.
            Paste your Firebase config in <code>src/firebase-config.js</code> to go live.
          </span>
        </div>
      )}

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="rule" aria-hidden="true" />
        <div>TheSheilingData — worksheets &amp; study material for classes 6–10.</div>
      </footer>
    </>
  )
}
