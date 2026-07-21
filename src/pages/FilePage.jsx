import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { slugify, formatBytes, formatDateTime, CLASSES, CLASS_NUMBERS } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from '../components/Spinner.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ReportDialog from '../components/ReportDialog.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function FilePage() {
  const { fileId } = useParams()
  const { user, isAdminRole } = useAuth()
  const navigate = useNavigate()

  const [file, setFile] = useState(undefined) // undefined = loading, null = missing
  const [url, setUrl] = useState(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [moveTo, setMoveTo] = useState(null) // {classNum, subject} while move UI open
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const viewCounted = useRef(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const rec = await backend.getFile(fileId)
      if (!alive) return
      setFile(rec)
      if (!rec) return
      if (!viewCounted.current) {
        viewCounted.current = true
        backend.registerView(fileId)
      }
      const bm = await backend.listBookmarkIds(user.uid)
      if (alive) setBookmarked(bm.includes(fileId))
      if (rec.fileType === 'image' || rec.fileType === 'pdf') {
        try {
          const u = await backend.getFileUrl(rec)
          if (alive) setUrl(u)
        } catch { /* preview unavailable; download still offered */ }
      }
    })().catch(() => alive && setFile(null))
    return () => { alive = false }
  }, [fileId, user.uid])

  if (file === undefined) return <div className="page-loading"><Spinner label="Loading file" /></div>
  if (file === null) {
    return (
      <EmptyState glyph="∅" title="File not found">
        This file may have been removed. <Link to="/classes">Back to classes</Link>
      </EmptyState>
    )
  }

  const download = async () => {
    await backend.registerDownload(file.id)
    setFile((f) => ({ ...f, downloadCount: (f.downloadCount || 0) + 1 }))
    const u = url || (await backend.getFileUrl(file))
    const a = document.createElement('a')
    a.href = u
    a.download = file.fileName
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const toggleBookmark = async () => {
    const saved = await backend.toggleBookmark(user.uid, file.id)
    setBookmarked(saved)
  }

  const adminDelete = async () => {
    setBusy(true)
    await backend.deleteFile(file, user)
    navigate(`/classes/${file.classNum}/${slugify(file.subject)}`, { replace: true })
  }

  const adminMove = async () => {
    setBusy(true)
    try {
      await backend.moveFile(file, moveTo, user)
      setFile((f) => ({ ...f, ...moveTo }))
      setMoveTo(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/classes">Classes</Link>
          <span className="sep">/</span>
          <Link to={`/classes/${file.classNum}`}>Class {file.classNum}</Link>
          <span className="sep">/</span>
          <Link to={`/classes/${file.classNum}/${slugify(file.subject)}`}>{file.subject}</Link>
          <span className="sep">/</span>
          <span>{file.fileName}</span>
        </nav>
        <h1 style={{ wordBreak: 'break-word' }}>{file.fileName}</h1>
      </div>

      <div className="file-detail">
        <div className="preview-pane">
          {file.fileType === 'image' && url ? (
            <img src={url} alt={file.fileName} />
          ) : file.fileType === 'pdf' && url ? (
            <iframe src={url} title={file.fileName} />
          ) : (
            <div className="preview-fallback">
              <span className="big-icon" aria-hidden="true">⇩</span>
              <p>
                {file.fileType === 'image' || file.fileType === 'pdf'
                  ? 'Preview unavailable — use Download to open this file.'
                  : 'No in-browser preview for this file type — use Download to open it.'}
              </p>
            </div>
          )}
        </div>

        <aside className="side-panel">
          <div className="stack">
            <button className="btn btn-primary btn-block" onClick={download}>
              Download
            </button>
            <button className="btn btn-block" onClick={toggleBookmark}>
              {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
            </button>
            <button className="btn btn-block" onClick={() => setReporting(true)}>
              ⚑ Report a problem
            </button>
          </div>

          <div className="stat-row">
            <div className="stat"><b>{file.viewCount || 0}</b><span>views</span></div>
            <div className="stat"><b>{file.downloadCount || 0}</b><span>downloads</span></div>
          </div>

          <dl>
            <dt>Class &amp; subject</dt>
            <dd>Class {file.classNum} · {file.subject}</dd>
            <dt>Chapter</dt>
            <dd>{file.chapter || '—'}</dd>
            <dt>Uploaded by</dt>
            <dd><Link to={`/teacher/${file.uploadedByUserId}`}>{file.uploaderName}</Link></dd>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(file.uploadedAt)}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(file.size)}</dd>
          </dl>

          {isAdminRole && (
            <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
              {moveTo ? (
                <>
                  <div className="field" style={{ marginBottom: '0.5rem' }}>
                    <label>Move to class</label>
                    <select
                      value={moveTo.classNum}
                      onChange={(e) => {
                        const c = e.target.value
                        setMoveTo({
                          classNum: c,
                          subject: CLASSES[c].includes(moveTo.subject) ? moveTo.subject : CLASSES[c][0],
                        })
                      }}
                    >
                      {CLASS_NUMBERS.map((n) => <option key={n} value={n}>Class {n}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: '0.5rem' }}>
                    <label>Subject</label>
                    <select
                      value={moveTo.subject}
                      onChange={(e) => setMoveTo({ ...moveTo, subject: e.target.value })}
                    >
                      {CLASSES[moveTo.classNum].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="row">
                    <button className="btn btn-primary btn-sm" onClick={adminMove} disabled={busy}>
                      {busy ? 'Moving…' : 'Confirm move'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMoveTo(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-block"
                  onClick={() => setMoveTo({ classNum: String(file.classNum), subject: file.subject })}
                >
                  Move file (admin)
                </button>
              )}
              <button className="btn btn-danger btn-block" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Delete file (admin)
              </button>
            </div>
          )}
        </aside>
      </div>

      {reporting && <ReportDialog file={file} onClose={() => setReporting(false)} />}
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete file?"
          message={`"${file.fileName}" will be removed permanently. This cannot be undone.`}
          confirmLabel="Delete permanently"
          danger
          busy={busy}
          onConfirm={adminDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  )
}
