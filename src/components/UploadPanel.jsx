import { useRef, useState } from 'react'
import {
  CLASSES, CLASS_NUMBERS, ACCEPTED_EXTENSIONS, MAX_FILE_MB, fileKind, formatBytes,
  CATEGORY_QUESTION_PAPER, CATEGORY_WORKSHEET, paperYears, EXAM_TYPES,
} from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { classifyLocally, rememberExample } from '../lib/localClassifier.js'

// Serverless bodies cap out around 4.5 MB, so only send a page preview when it
// comfortably fits. Anything larger is classified from its file name instead.
const MAX_DETECT_BYTES = 3.5 * 1024 * 1024

// Hard cap on how long auto-detect may take. The AI call is normally ~1.3s;
// this guarantees detection never leaves the teacher waiting past 5 seconds,
// falling back to the file-name guess or manual entry instead.
const DETECT_TIMEOUT_MS = 5000

const MAX_PAGES = 20

// Shrink a photo of a worksheet before sending it for detection. The header is
// still perfectly legible at 1600px, and it cuts a 6 MB phone photo to ~200 KB.
async function downscaleImage(file, maxDim = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
    fr.onerror = () => reject(new Error('Could not read the file.'))
    fr.readAsDataURL(blob)
  })
}

const CONFIDENCE_LABEL = {
  high: 'Confident',
  medium: 'Fairly sure',
  low: 'Not sure — please check',
}

export default function UploadPanel({ classNum, subject, category = CATEGORY_WORKSHEET, onUploaded }) {
  const { user, isVerified } = useAuth()
  const isQB = category === CATEGORY_QUESTION_PAPER
  const [cls, setCls] = useState(String(classNum))
  const [subj, setSubj] = useState(subject)
  const [chapter, setChapter] = useState('')
  const [worksheetNo, setWorksheetNo] = useState('')
  const [examType, setExamType] = useState('')
  const [year, setYear] = useState(paperYears()[0])
  const [files, setFiles] = useState([])          // every page, in order
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  // Auto-detection: 'idle' | 'detecting' | 'detected' | 'confirmed' | 'manual' | 'failed'
  const [detectState, setDetectState] = useState('idle')
  const [prediction, setPrediction] = useState(null)
  const [detectNote, setDetectNote] = useState('')
  const [learnedFrom, setLearnedFrom] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const resetDetection = () => {
    setDetectState('idle'); setPrediction(null); setDetectNote('')
  }

  // Detection always reads the FIRST page — that is where the header box is.
  const detect = async (f) => {
    const kind = fileKind(f.name)
    setDetectState('detecting'); setDetectNote(''); setPrediction(null)

    // Step 1 — try to work it out locally. Most school files are named well
    // enough to classify for free, instantly, without touching the API.
    const local = classifyLocally(f.name)
    if (local.confidence === 'high') {
      setPrediction(local)
      setDetectState('detected')
      return
    }

    // Step 2 — the name wasn't enough, so ask Gemini to look at the page.
    try {
      let dataBase64 = null
      let mimeType = null
      if (kind === 'image') {
        const small = await downscaleImage(f)
        if (small) { dataBase64 = await blobToBase64(small); mimeType = 'image/jpeg' }
      } else if (kind === 'pdf' && f.size <= MAX_DETECT_BYTES) {
        dataBase64 = await blobToBase64(f)
        mimeType = 'application/pdf'
      }

      const token = await backend.getAccessToken()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS)
      let res
      try {
        res = await fetch('/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'classify', fileName: f.name, fileKind: kind, mimeType, dataBase64,
            localGuess: local.classNum ? local : null,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Auto-detect failed.')

      setPrediction({ ...data.prediction, source: 'ai' })
      setLearnedFrom(data.learnedFrom ?? null)
      setDetectState('detected')
      if (!data.sawPage) {
        setDetectNote('Only the file name could be read for this file type.')
      }
    } catch (e) {
      const timedOut = e.name === 'AbortError'
      // If the API is down, slow, or out of quota but the file name still gave
      // us a usable answer, offer that rather than making the teacher restart.
      if (local.classNum && local.subject) {
        setPrediction(local)
        setDetectState('detected')
        setDetectNote(
          timedOut
            ? 'The AI check was taking too long, so this is from the file name.'
            : 'Worked out from the file name — the AI check was unavailable.',
        )
        return
      }
      setDetectNote(
        timedOut
          ? 'Auto-detect took too long — please choose the class and subject below.'
          : e.message || 'Auto-detect is unavailable.',
      )
      setDetectState('failed')
    }
  }

  const addFiles = (picked) => {
    setError(''); setSuccess('')
    const incoming = Array.from(picked || [])
    if (!incoming.length) return

    const accepted = []
    for (const f of incoming) {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`)
        continue
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`"${f.name}" is too large (${formatBytes(f.size)}). Maximum is ${MAX_FILE_MB} MB per page.`)
        continue
      }
      accepted.push(f)
    }
    if (!accepted.length) return

    setFiles((prev) => {
      const next = [...prev, ...accepted].slice(0, MAX_PAGES)
      if (prev.length + accepted.length > MAX_PAGES) {
        setError(`A single entry can hold at most ${MAX_PAGES} pages.`)
      }
      // Re-detect whenever the first page changes.
      if (!prev.length) { resetDetection(); detect(next[0]) }
      return next
    })
  }

  const removePage = (index) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (!next.length) resetDetection()
      else if (index === 0) { resetDetection(); detect(next[0]) }
      return next
    })
  }

  const movePage = (index, delta) => {
    setFiles((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      if (index === 0 || target === 0) { resetDetection(); detect(next[0]) }
      return next
    })
  }

  const confirmDetection = () => {
    const p = prediction
    if (p?.classNum) setCls(String(p.classNum))
    if (p?.subject) setSubj(p.subject)
    if (p?.chapter) setChapter(p.chapter)
    if (p?.worksheetNo && !isQB) setWorksheetNo(p.worksheetNo)
    if (p?.examType && isQB) setExamType(p.examType)
    if (p?.paperYear && isQB && paperYears().includes(p.paperYear)) setYear(p.paperYear)
    setDetectState('confirmed')
  }

  // Record what the human actually chose. This is what makes detection improve.
  const recordFeedback = async (finalValues) => {
    try {
      const token = await backend.getAccessToken()
      await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'feedback',
          fileName: files[0].name,
          fileKind: fileKind(files[0].name),
          headerText: prediction?.headerText || '',
          prediction,
          final: finalValues,
        }),
      })
    } catch {
      /* Never block an upload because the learning write failed. */
    }
  }

  const seedFromLibrary = async () => {
    setSeeding(true); setDetectNote('')
    try {
      const token = await backend.getAccessToken()
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'seed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not learn from the library.')
      setSuccess(
        data.seeded
          ? `Learned from ${data.seeded} file${data.seeded === 1 ? '' : 's'} already in the library.`
          : 'No files in the library to learn from yet.',
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!files.length) { setError('Choose a file to upload.'); return }
    if (detectState === 'detected') {
      setError('Confirm the detected class and subject, or choose them manually.')
      return
    }
    if (!isQB && !chapter.trim()) { setError('Enter a chapter tag so students can find this file.'); return }
    setBusy(true)
    try {
      await backend.uploadFile({
        classNum: cls, subject: subj, chapter, files, file: files[0], user,
        fileType: fileKind(files[0].name),
        category,
        paperYear: isQB ? year : null,
        examType: isQB ? examType : null,
        worksheetNo: isQB ? null : worksheetNo.trim(),
      })
      // Teach both detectors: the local one instantly, the server one for
      // everybody else's future uploads.
      rememberExample({ fileName: files[0].name, classNum: cls, subject: subj, category, chapter })
      if (prediction) {
        await recordFeedback({ classNum: cls, subject: subj, category, chapter })
      }
      const pageNote = files.length > 1 ? ` (${files.length} pages)` : ''
      setSuccess(`Uploaded "${files[0].name}"${pageNote} to Class ${cls} · ${subj}${isQB ? ` · ${year}` : ''}.`)
      const uploaded = { classNum: cls, subject: subj, category, paperYear: isQB ? year : null }
      setFiles([]); setChapter(''); setWorksheetNo(''); resetDetection()
      if (inputRef.current) inputRef.current.value = ''
      onUploaded?.(uploaded)
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isVerified) {
    return (
      <div className="upload-panel">
        <h3>{isQB ? 'Upload question paper' : 'Upload worksheet'}</h3>
        <p className="note">Verify your email address before uploading files.</p>
      </div>
    )
  }

  const awaitingChoice = detectState === 'detected'
  const showFields = detectState !== 'detecting' && !awaitingChoice
  const categoryMismatch = prediction?.category && prediction.category !== category

  return (
    <form className="upload-panel" onSubmit={submit}>
      <h3>{isQB ? 'Upload question paper' : 'Upload worksheet'}</h3>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <div
        className={drag ? 'drop-zone drag' : 'drop-zone'}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        aria-label="Choose files to upload"
      >
        {files.length
          ? <><b>{files.length} page{files.length === 1 ? '' : 's'} selected</b> — click to add more</>
          : <>Drop pages here or <b>click to browse</b> — images, PDF, Word, PowerPoint · up to {MAX_FILE_MB} MB each<br />
            <span className="drop-hint">Selecting several photos keeps them together as one multi-page entry.</span></>}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ol className="page-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="page-num">{i + 1}</span>
              <span className="page-name" title={f.name}>{f.name}</span>
              <span className="page-size">{formatBytes(f.size)}</span>
              <span className="page-actions">
                <button type="button" onClick={() => movePage(i, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} up`}>↑</button>
                <button type="button" onClick={() => movePage(i, 1)} disabled={i === files.length - 1} aria-label={`Move page ${i + 1} down`}>↓</button>
                <button type="button" onClick={() => removePage(i)} aria-label={`Remove page ${i + 1}`}>✕</button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {detectState === 'detecting' && (
        <div className="detect-card detecting" role="status">
          <span className="detect-spinner" aria-hidden="true" />
          <span>Reading the sheet to detect its class and subject…</span>
        </div>
      )}

      {awaitingChoice && prediction && (
        <div className="detect-card" role="status" aria-live="polite">
          <div className="detect-head">
            <span className="detect-title">Auto-detected</span>
            <span className={`detect-badge conf-${prediction.confidence}`}>
              {CONFIDENCE_LABEL[prediction.confidence] || prediction.confidence}
            </span>
            {prediction.source && prediction.source !== 'ai' && (
              <span className="detect-badge offline">
                {prediction.source === 'memory' ? 'Remembered' : 'No AI needed'}
              </span>
            )}
          </div>

          {prediction.classNum && prediction.subject ? (
            <p className="detect-result">
              <b>Class {prediction.classNum}</b> · <b>{prediction.subject}</b>
              {' · '}
              {prediction.category === CATEGORY_QUESTION_PAPER ? 'Question paper' : 'Worksheet'}
              {prediction.examType
                ? <> · {EXAM_TYPES.find((x) => x.id === prediction.examType)?.label}</> : null}
              {prediction.worksheetNo ? <> · Worksheet {prediction.worksheetNo}</> : null}
              {prediction.paperYear ? <> · {prediction.paperYear}</> : null}
              {prediction.chapter ? <> · {prediction.chapter}</> : null}
            </p>
          ) : (
            <p className="detect-result">
              Could not read the class and subject from this file.
            </p>
          )}

          {prediction.reasoning && <p className="detect-why">{prediction.reasoning}</p>}
          {detectNote && <p className="detect-why">{detectNote}</p>}
          {categoryMismatch && (
            <p className="detect-warn">
              This looks like a {prediction.category === CATEGORY_QUESTION_PAPER ? 'question paper' : 'worksheet'},
              but you are uploading to {isQB ? 'the Question Bank' : 'worksheets'}.
            </p>
          )}

          <div className="detect-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmDetection}
              disabled={!prediction.classNum || !prediction.subject}
            >
              Confirm
            </button>
            <button type="button" className="btn" onClick={() => setDetectState('manual')}>
              Choose manually
            </button>
          </div>
        </div>
      )}

      {detectState === 'confirmed' && (
        <p className="detect-strip ok">Detected class and subject confirmed — edit below if needed.</p>
      )}
      {detectState === 'manual' && (
        <p className="detect-strip">Pick the correct class and subject below — your choice teaches the detector.</p>
      )}
      {detectState === 'failed' && (
        <p className="detect-strip warn">{detectNote} Please fill the fields in yourself.</p>
      )}

      {showFields && (
        <>
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
            {isQB ? (
              <>
                <div className="field">
                  <label htmlFor="up-exam">Examination</label>
                  <select id="up-exam" value={examType} onChange={(e) => setExamType(e.target.value)}>
                    <option value="">— Not specified —</option>
                    {EXAM_TYPES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label} ({x.marks.join(' or ')} marks)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="up-year">Year</label>
                  <select id="up-year" value={year} onChange={(e) => setYear(e.target.value)}>
                    {paperYears().map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="up-wsno">Worksheet number</label>
                  <input
                    id="up-wsno"
                    value={worksheetNo}
                    onChange={(e) => setWorksheetNo(e.target.value)}
                    placeholder="e.g. 2"
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="up-chapter">Chapter / topic</label>
                  <input
                    id="up-chapter"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    placeholder="e.g. Laws of Motion"
                  />
                </div>
              </>
            )}
          </div>

          {isQB && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="up-chapter-opt">Label (optional)</label>
              <input
                id="up-chapter-opt"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="e.g. Set A / Section 1"
              />
            </div>
          )}
        </>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy || detectState === 'detecting'}>
        {busy
          ? 'Uploading…'
          : files.length > 1
            ? `Upload ${files.length} pages as one ${isQB ? 'paper' : 'worksheet'}`
            : isQB ? 'Upload question paper' : 'Upload file'}
      </button>

      <p className="detect-foot">
        Well-named files are detected instantly on your device with no AI usage;
        only unclear ones are sent to the AI.
        {learnedFrom !== null
          ? ` It is learning from ${learnedFrom} confirmed example${learnedFrom === 1 ? '' : 's'}.`
          : ' It improves every time you confirm or correct it.'}
        {' '}
        <button type="button" className="link-btn" onClick={seedFromLibrary} disabled={seeding}>
          {seeding ? 'Learning…' : 'Teach it from the existing library'}
        </button>
      </p>
    </form>
  )
}
