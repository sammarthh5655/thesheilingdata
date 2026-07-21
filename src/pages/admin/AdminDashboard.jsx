import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ADMIN_PATH, ADMIN_ID_SHA256, DEFAULT_ADMIN_DIGESTS,
  CLASSES, CLASS_NUMBERS, formatBytes, formatDateTime,
} from '../../config.js'
import { backend } from '../../backend/index.js'
import { useAuth } from '../../context/AuthContext.jsx'
import Spinner from '../../components/Spinner.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import { ADMIN_GATE_KEY } from './AdminLogin.jsx'

const SECTIONS = [
  ['analytics', 'Analytics'],
  ['users', 'All Users'],
  ['files', 'All Files'],
  ['reports', 'Flagged Files'],
  ['logins', 'Login / Signup Activity'],
  ['audit', 'Admin Audit Log'],
]

export default function AdminDashboard() {
  const { user, isAdminRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const gate = sessionStorage.getItem(ADMIN_GATE_KEY) === '1'

  const [section, setSection] = useState('analytics')
  const [data, setData] = useState(null) // {users, files, logs, reports, audit}
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const [users, files, logs, reports, audit] = await Promise.all([
      backend.listUsers(), backend.allFiles(), backend.listLoginLogs(),
      backend.listReports(), backend.listAudit(),
    ])
    setData({ users, files, logs, reports, audit })
  }, [])

  useEffect(() => {
    if (!gate) { navigate(`/${ADMIN_PATH}/login`, { replace: true }); return }
    if (backend.mode !== 'local' && !authLoading && !isAdminRole) return
    reload().catch((e) => setError(e.message || 'Failed to load admin data.'))
  }, [gate, authLoading, isAdminRole, navigate, reload])

  if (!gate) return null
  if (backend.mode !== 'local' && !authLoading && !isAdminRole) {
    return (
      <div className="admin-login-screen">
        <div className="auth-card" style={{ margin: 0 }}>
          <h1>Access denied</h1>
          <p className="sub">
            Your signed-in account does not have the admin role. Sign in with an
            admin account on the main site, then return here.
          </p>
          <Link className="btn btn-primary btn-block" to="/login">Go to sign in</Link>
        </div>
      </div>
    )
  }

  const leave = () => {
    sessionStorage.removeItem(ADMIN_GATE_KEY)
    navigate('/', { replace: true })
  }

  const usingDefaults = DEFAULT_ADMIN_DIGESTS.includes(ADMIN_ID_SHA256)

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand">TheSheilingData <span>· Admin</span></div>
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
        <div className="side-foot">
          <button onClick={leave}>← Exit admin panel</button>
        </div>
      </aside>

      <main className="admin-main">
        {usingDefaults && (
          <div className="form-error" style={{ marginBottom: '1.25rem' }}>
            <b>Security:</b> the admin panel is still using the default
            credentials. Change <code>ADMIN_PATH</code>, <code>ADMIN_ID_SHA256</code> and{' '}
            <code>ADMIN_PASS_SHA256</code> in <code>src/config.js</code> before going live.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        {!data ? (
          <div className="page-loading"><Spinner label="Loading admin data" /></div>
        ) : (
          <>
            {section === 'analytics' && <Analytics data={data} />}
            {section === 'users' && <Users data={data} admin={user} reload={reload} />}
            {section === 'files' && <Files data={data} admin={user} reload={reload} />}
            {section === 'reports' && <Reports data={data} admin={user} reload={reload} />}
            {section === 'logins' && <Logins data={data} />}
            {section === 'audit' && <Audit data={data} />}
          </>
        )}
      </main>
    </div>
  )
}

/* --- Analytics ------------------------------------------------------------- */
function Analytics({ data }) {
  const { users, files, logs } = data
  const [range, setRange] = useState('daily')

  const totals = useMemo(() => ({
    users: users.length,
    teachers: users.filter((u) => u.role === 'teacher').length,
    files: files.length,
    storage: files.reduce((s, f) => s + (f.size || 0), 0),
    views: files.reduce((s, f) => s + (f.viewCount || 0), 0),
    downloads: files.reduce((s, f) => s + (f.downloadCount || 0), 0),
  }), [users, files])

  const topSubjects = useMemo(() => {
    const map = {}
    for (const f of files) {
      const k = `Class ${f.classNum} · ${f.subject}`
      map[k] = (map[k] || 0) + (f.viewCount || 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [files])

  const topClasses = useMemo(() => {
    const map = {}
    for (const f of files) {
      const k = `Class ${f.classNum}`
      map[k] = (map[k] || 0) + (f.viewCount || 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [files])

  const uploadsPerTeacher = useMemo(() => {
    const map = {}
    for (const f of files) map[f.uploaderName] = (map[f.uploaderName] || 0) + 1
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [files])

  const activeUsers = useMemo(() => {
    const buckets = new Map()
    const label = (d) => {
      if (range === 'daily') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      if (range === 'weekly') {
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        return `wk of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      }
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    }
    for (const l of logs) {
      if (!l.success || !l.userId || !l.at) continue
      const k = label(new Date(l.at))
      if (!buckets.has(k)) buckets.set(k, new Set())
      buckets.get(k).add(l.userId)
    }
    return [...buckets.entries()].slice(0, 12).map(([k, set]) => [k, set.size])
  }, [logs, range])

  return (
    <>
      <h1>Analytics</h1>
      <div className="stat-cards">
        <div className="stat-card"><b>{totals.users}</b><span>total accounts</span></div>
        <div className="stat-card"><b>{totals.teachers}</b><span>authorized teachers</span></div>
        <div className="stat-card"><b>{totals.files}</b><span>files uploaded</span></div>
        <div className="stat-card"><b>{formatBytes(totals.storage)}</b><span>storage used</span></div>
        <div className="stat-card"><b>{totals.views}</b><span>total views</span></div>
        <div className="stat-card"><b>{totals.downloads}</b><span>total downloads</span></div>
      </div>

      <div className="panel">
        <div className="row spread">
          <h3>Active users over time</h3>
          <div className="row">
            {['daily', 'weekly', 'monthly'].map((r) => (
              <button
                key={r}
                className={range === r ? 'chip active' : 'chip'}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {activeUsers.length === 0 ? (
          <p className="text-muted">No sign-in activity yet.</p>
        ) : (
          <BarList rows={activeUsers} />
        )}
      </div>

      <div className="panel">
        <h3>Most-viewed subjects</h3>
        {topSubjects.length === 0
          ? <p className="text-muted">No files yet.</p>
          : <BarList rows={topSubjects} />}
      </div>

      <div className="panel">
        <h3>Views by class</h3>
        {topClasses.length === 0
          ? <p className="text-muted">No files yet.</p>
          : <BarList rows={topClasses} />}
      </div>

      <div className="panel">
        <h3>Upload volume per teacher</h3>
        {uploadsPerTeacher.length === 0
          ? <p className="text-muted">No uploads yet.</p>
          : <BarList rows={uploadsPerTeacher} />}
      </div>
    </>
  )
}

function BarList({ rows }) {
  const max = Math.max(...rows.map(([, v]) => v), 1)
  return (
    <div className="bar-list">
      {rows.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span className="bar-label" title={label}>{label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="bar-val">{value}</span>
        </div>
      ))}
    </div>
  )
}

/* --- Users ------------------------------------------------------------------ */
function Users({ data, admin, reload }) {
  const { users, logs } = data
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [pendingBan, setPendingBan] = useState(null)

  const visible = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false
    const needle = q.trim().toLowerCase()
    return !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
  })

  const changeRole = async (u, role) => {
    if (role === u.role) return
    setBusyId(u.id)
    try { await backend.setRole(u.id, role, admin); await reload() }
    finally { setBusyId(null) }
  }

  const setBan = async (u, banned) => {
    setBusyId(u.id)
    try { await backend.setStatus(u.id, banned ? 'banned' : 'active', admin); await reload() }
    finally { setBusyId(null); setPendingBan(null) }
  }

  const toggleBan = (u) => {
    if (u.status === 'banned') { setBan(u, false); return }
    setPendingBan(u)
  }

  return (
    <>
      <h1>All Users</h1>
      <div className="admin-toolbar">
        <input
          type="search" placeholder="Search name or email…"
          value={q} onChange={(e) => setQ(e.target.value)}
          aria-label="Search users"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {users.length === 0 ? (
        <EmptyState glyph="◱" title="No accounts yet">
          Users appear here as soon as someone signs up.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState glyph="⌕" title="No matches">No users match this search.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Verified</th>
                <th>Status</th><th>Joined</th><th>Last sign-in</th><th>History</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <UserRow
                  key={u.id} u={u} logs={logs}
                  expanded={expanded === u.id}
                  onExpand={() => setExpanded(expanded === u.id ? null : u.id)}
                  onRole={changeRole} onBan={toggleBan}
                  busy={busyId === u.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingBan && (
        <ConfirmDialog
          title="Suspend account?"
          message={`${pendingBan.name} (${pendingBan.email}) will lose access immediately, including any upload rights.`}
          confirmLabel="Suspend account"
          danger
          busy={busyId === pendingBan.id}
          onConfirm={() => setBan(pendingBan, true)}
          onCancel={() => setPendingBan(null)}
        />
      )}
    </>
  )
}

function UserRow({ u, logs, expanded, onExpand, onRole, onBan, busy }) {
  const history = logs.filter((l) => l.userId === u.id)
  return (
    <>
      <tr>
        <td><b>{u.name}</b></td>
        <td className="mono">{u.email}</td>
        <td>
          <select
            value={u.role}
            onChange={(e) => onRole(u, e.target.value)}
            disabled={busy}
            aria-label={`Role for ${u.name}`}
          >
            <option value="student">student</option>
            <option value="teacher">teacher</option>
            <option value="admin">admin</option>
          </select>
        </td>
        <td>{u.verified ? <span className="badge ok">yes</span> : <span className="badge pending">no</span>}</td>
        <td>
          {u.status === 'banned'
            ? <span className="badge banned">banned</span>
            : <span className="badge ok">active</span>}
        </td>
        <td className="mono">{formatDateTime(u.createdAt)}</td>
        <td className="mono">{formatDateTime(u.lastLoginAt)}</td>
        <td>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn btn-sm" onClick={onExpand}>
              {expanded ? 'Hide' : `View (${history.length})`}
            </button>
            <button
              className={u.status === 'banned' ? 'btn btn-sm' : 'btn btn-sm btn-danger'}
              onClick={() => onBan(u)}
              disabled={busy}
            >
              {busy ? '…' : u.status === 'banned' ? 'Unban' : 'Ban'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8}>
            {history.length === 0 ? (
              <span className="text-muted">No recorded sign-in events for this user.</span>
            ) : (
              <ul className="login-history">
                {history.map((l) => (
                  <li key={l.id}>
                    <span className="mono">{formatDateTime(l.at)}</span>
                    <span className={l.success ? 'ev-ok' : 'ev-fail'}>
                      {l.type}{l.success ? '' : ' (failed)'}
                    </span>
                    <span>{l.device}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* --- Files ------------------------------------------------------------------- */
function Files({ data, admin, reload }) {
  const { files } = data
  const [q, setQ] = useState('')
  const [moving, setMoving] = useState(null) // {file, classNum, subject}
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const visible = files.filter((f) => {
    const needle = q.trim().toLowerCase()
    return !needle ||
      f.fileName.toLowerCase().includes(needle) ||
      f.subject.toLowerCase().includes(needle) ||
      (f.chapter || '').toLowerCase().includes(needle) ||
      f.uploaderName.toLowerCase().includes(needle) ||
      String(f.classNum) === needle
  })

  const del = async (f) => {
    setBusyId(f.id)
    try { await backend.deleteFile(f, admin); await reload() }
    finally { setBusyId(null); setPendingDelete(null) }
  }

  const confirmMove = async () => {
    setBusyId(moving.file.id)
    try {
      await backend.moveFile(moving.file, { classNum: moving.classNum, subject: moving.subject }, admin)
      setMoving(null)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <h1>All Files</h1>
      <div className="admin-toolbar">
        <input
          type="search" placeholder="Search files, subjects, uploaders…"
          value={q} onChange={(e) => setQ(e.target.value)}
          aria-label="Search files"
        />
      </div>

      {files.length === 0 ? (
        <EmptyState glyph="✎" title="No files uploaded yet">
          Files uploaded by teachers will appear here.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState glyph="⌕" title="No matches">No files match this search.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>File</th><th>Location</th><th>Chapter</th><th>Uploader</th>
                <th>Uploaded</th><th>Size</th><th>Views</th><th>DLs</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id}>
                  <td><Link to={`/file/${f.id}`}><b>{f.fileName}</b></Link></td>
                  <td>Class {f.classNum} · {f.subject}</td>
                  <td>{f.chapter || '—'}</td>
                  <td>{f.uploaderName}</td>
                  <td className="mono">{formatDateTime(f.uploadedAt)}</td>
                  <td className="mono">{formatBytes(f.size)}</td>
                  <td className="mono">{f.viewCount || 0}</td>
                  <td className="mono">{f.downloadCount || 0}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => setMoving({ file: f, classNum: String(f.classNum), subject: f.subject })}
                      >
                        Move
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setPendingDelete(f)}
                        disabled={busyId === f.id}
                      >
                        {busyId === f.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete file?"
          message={`"${pendingDelete.fileName}" (Class ${pendingDelete.classNum} · ${pendingDelete.subject}) will be removed permanently. This cannot be undone.`}
          confirmLabel="Delete permanently"
          danger
          busy={busyId === pendingDelete.id}
          onConfirm={() => del(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {moving && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setMoving(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h3>Move file</h3>
            <p className="sub">“{moving.file.fileName}”</p>
            <div className="field">
              <label>Class</label>
              <select
                value={moving.classNum}
                onChange={(e) => {
                  const c = e.target.value
                  setMoving((m) => ({
                    ...m, classNum: c,
                    subject: CLASSES[c].includes(m.subject) ? m.subject : CLASSES[c][0],
                  }))
                }}
              >
                {CLASS_NUMBERS.map((n) => <option key={n} value={n}>Class {n}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Subject</label>
              <select
                value={moving.subject}
                onChange={(e) => setMoving((m) => ({ ...m, subject: e.target.value }))}
              >
                {CLASSES[moving.classNum].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setMoving(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmMove} disabled={busyId === moving.file.id}>
                {busyId === moving.file.id ? 'Moving…' : 'Move file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* --- Reports ------------------------------------------------------------------ */
function Reports({ data, admin, reload }) {
  const { reports, files } = data
  const [filter, setFilter] = useState('open')
  const [busyId, setBusyId] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null) // {report, file}

  const visible = reports.filter((r) => !filter || r.status === filter)

  const dismiss = async (r) => {
    setBusyId(r.id)
    try { await backend.setReportStatus(r.id, 'dismissed', admin); await reload() }
    finally { setBusyId(null) }
  }

  const removeFile = async (r) => {
    const file = files.find((f) => f.id === r.fileId)
    if (!file) {
      await backend.setReportStatus(r.id, 'resolved', admin)
      await reload()
      return
    }
    setPendingRemove({ report: r, file })
  }

  const confirmRemove = async () => {
    const { report, file } = pendingRemove
    setBusyId(report.id)
    try {
      await backend.deleteFile(file, admin)
      await reload()
    } finally {
      setBusyId(null)
      setPendingRemove(null)
    }
  }

  return (
    <>
      <h1>Flagged Files</h1>
      <div className="admin-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter reports">
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState glyph="⚑" title={filter === 'open' ? 'No open reports' : 'No reports here'}>
          {filter === 'open'
            ? 'When a user flags a file, it appears here for review.'
            : 'Nothing with this status yet.'}
        </EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>File</th><th>Location</th><th>Reported by</th>
                <th>Reason</th><th>When</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    {files.some((f) => f.id === r.fileId)
                      ? <Link to={`/file/${r.fileId}`}><b>{r.fileName}</b></Link>
                      : <span><b>{r.fileName}</b> <span className="text-muted">(removed)</span></span>}
                  </td>
                  <td>Class {r.classNum} · {r.subject}</td>
                  <td>{r.reporterName}</td>
                  <td style={{ maxWidth: 260 }}>{r.reason}</td>
                  <td className="mono">{formatDateTime(r.createdAt)}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>
                    {r.status === 'open' && (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => dismiss(r)} disabled={busyId === r.id}>
                          Dismiss
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeFile(r)} disabled={busyId === r.id}>
                          Remove file
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove reported file?"
          message={`"${pendingRemove.file.fileName}" will be deleted permanently and the report resolved. This cannot be undone.`}
          confirmLabel="Delete file"
          danger
          busy={busyId === pendingRemove.report.id}
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </>
  )
}

/* --- Login activity ------------------------------------------------------------ */
function Logins({ data }) {
  const { logs, users } = data
  const [typeFilter, setTypeFilter] = useState('')
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  const visible = logs.filter((l) => !typeFilter || l.type === typeFilter)

  return (
    <>
      <h1>Login / Signup Activity</h1>
      <div className="admin-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by event type">
          <option value="">All events</option>
          <option value="login">Logins</option>
          <option value="signup">Signups</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState glyph="◷" title="No activity yet">
          Every login and signup will be recorded here.
        </EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Event</th><th>User</th><th>Email</th><th>Result</th><th>Device</th></tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{formatDateTime(l.at)}</td>
                  <td>{l.type}</td>
                  <td>{byId[l.userId]?.name || <span className="text-muted">—</span>}</td>
                  <td className="mono">{l.email || byId[l.userId]?.email || '—'}</td>
                  <td>
                    {l.success
                      ? <span className="badge ok">success</span>
                      : <span className="badge banned">failed</span>}
                  </td>
                  <td className="text-muted">{l.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* --- Audit log ------------------------------------------------------------------ */
function Audit({ data }) {
  const { audit } = data
  return (
    <>
      <h1>Admin Audit Log</h1>
      {audit.length === 0 ? (
        <EmptyState glyph="✓" title="No admin actions yet">
          Role changes, bans, deletions and report decisions are recorded here.
        </EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Admin</th><th>Action</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.at)}</td>
                  <td>{a.adminName}</td>
                  <td>{a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
