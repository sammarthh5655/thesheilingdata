import { useRef, useState } from 'react'
import { CLASSES, CLASS_NUMBERS, ACCEPTED_EXTENSIONS, MAX_FILE_MB, fileKind, formatBytes } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function UploadPanel({ classNum, subject, onUploaded }) {
  const { user, isVerified } = useAuth()
  const [cls, setCls] = useState(String(classNum))
  const [subj, setSubj] = useState(subject)
  const [chapter, setChapter] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const pick = (f) => {
    setError(''); setSuccess('')
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`)
      return
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File is too large (${formatBytes(f.size)}). Maximum is ${MAX_FILE_MB} MB.`)
      return
    }
    setFile(f)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!file) { setError('Choose a file to upload.'); return }
    if (!chapter.trim()) { setError('Enter a chapter tag so students can find this file.'); return }
    setBusy(true)
    try {
      await backend.uploadFile({
        classNum: cls, subject: subj, chapter, file, user,
        fileType: fileKind(file.name),
      })
      setSuccess(`Uploaded "${file.name}" to Class ${cls} · ${subj}.`)
      setFile(null); setChapter('')
      if (inputRef.current) inputRef.current.value = ''
      onUploaded?.()
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isVerified) {
    return (
      <div className="upload-panel">
        <h3>Upload worksheet</h3>
        <p className="note">Verify your email address before uploading files.</p>
      </div>
    )
  }

  return (
    <form className="upload-panel" onSubmit={submit}>
      <h3>Upload worksheet</h3>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <div
        className={drag ? 'drop-zone drag' : 'drop-zone'}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        aria-label="Choose a file to upload"
      >
        {file
          ? <><b>{file.name}</b> ({formatBytes(file.size)}) — click to change</>
          : <>Drop a file here or <b>click to browse</b> — images, PDF, Word, PowerPoint · up to {MAX_FILE_MB} MB</>}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          hidden
          onChange={(e) => pick(e.target.files[0])}
        />
      </div>

      <div className="upload-grid">
        <div className="field">
          <label htmlFor="up-class">Class</label>
          <select id="up-class" value={cls} onChange={(e) => {
            setCls(e.target.value)
            if (!CLASSES[e.target.value].includes(subj)) setSubj(CLASSES[e.target.value][0])
          }}>
            {CLASS_NUMBERS.map((n) => <option key={n} value={n}>Class {n}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="up-subject">Subject</label>
          <select id="up-subject" value={subj} onChange={(e) => setSubj(e.target.value)}>
            {CLASSES[cls].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="up-chapter">Chapter tag</label>
          <input
            id="up-chapter"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="e.g. Ch 4 — Light"
          />
        </div>
      </div>

      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload file'}
      </button>
    </form>
  )
}
