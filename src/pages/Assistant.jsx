import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from '../components/Spinner.jsx'

const SUGGESTIONS = [
  'Where can I find Class 9 Physics worksheets?',
  'Do we have any previous-year Maths question papers for Class 10?',
  'Explain what topics I should revise for the Class 8 Science chapter on Light.',
]

// Renders assistant text with clickable in-site links like /file/abc or /classes/9.
function AssistantText({ text }) {
  const parts = text.split(/((?:\/(?:file|classes|question-bank)\/[A-Za-z0-9\-/]+))/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\/(file|classes|question-bank)\//.test(p)
          ? <Link key={i} to={p}>{p}</Link>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

export default function Assistant() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const fileId = params.get('file')

  const [attachedFile, setAttachedFile] = useState(null) // full record or null
  const [catalog, setCatalog] = useState(null)
  const [messages, setMessages] = useState([]) // {role:'user'|'assistant', text}
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const taRef = useRef(null)

  const autosize = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
    ta.style.overflowY = ta.scrollHeight > 140 ? 'auto' : 'hidden'
  }

  // Load the site catalog once (metadata only) so the AI can answer
  // "where is the ... of year ..." questions with real links.
  useEffect(() => {
    let alive = true
    backend.allFiles()
      .then((files) => {
        if (!alive) return
        setCatalog(files.map((f) => ({
          id: f.id, name: f.fileName, class: f.classNum, subject: f.subject,
          chapter: f.chapter || null, category: f.category || 'worksheet',
          year: f.paperYear || null, type: f.fileType,
        })))
      })
      .catch(() => alive && setCatalog([]))
    return () => { alive = false }
  }, [])

  // Load the attached file record when arriving via "Ask AI about this".
  useEffect(() => {
    let alive = true
    if (!fileId) { setAttachedFile(null); return }
    backend.getFile(fileId)
      .then((rec) => alive && setAttachedFile(rec))
      .catch(() => alive && setAttachedFile(null))
    return () => { alive = false }
  }, [fileId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const detach = () => {
    setAttachedFile(null)
    params.delete('file')
    setParams(params, { replace: true })
  }

  const send = async (text) => {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setInput(''); setError('')
    if (taRef.current) taRef.current.style.height = 'auto'
    const history = [...messages, { role: 'user', text: question }]
    setMessages(history)
    setBusy(true)
    try {
      let filePayload = null
      if (attachedFile) {
        let url = null
        try { url = await backend.getFileUrl(attachedFile) } catch { /* no url */ }
        filePayload = {
          name: attachedFile.fileName,
          fileType: attachedFile.fileType,
          classNum: attachedFile.classNum,
          subject: attachedFile.subject,
          chapter: attachedFile.chapter || null,
          category: attachedFile.category || 'worksheet',
          paperYear: attachedFile.paperYear || null,
          url: url && url.startsWith('http') ? url : null,
        }
      }
      const token = await backend.getAccessToken()
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: history.slice(-20).map((m) => ({ role: m.role, text: m.text })),
          file: filePayload,
          catalog: (catalog || []).slice(0, 400),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `The assistant is unavailable right now (HTTP ${res.status}).`)
      }
      const data = await res.json()
      setMessages((m) => [...m, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Could not reach the AI service. (In local development, run "vercel dev" so the /api function is available.)'
          : err.message
      )
      // Roll the unanswered question back into the input so nothing is lost.
      setMessages((m) => m.slice(0, -1))
      setInput(question)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="assistant-page">
      <div className="page-head">
        <h1>AI Assistant</h1>
        <p className="sub">
          Ask where to find worksheets or question papers, or attach a file and ask
          questions about it — extra practice questions, answers, explanations.
        </p>
      </div>

      {attachedFile && (
        <div className="ai-attachment" role="note">
          <span className="ai-attachment-icon" aria-hidden="true">📎</span>
          <span>
            Discussing: <b>{attachedFile.fileName}</b>{' '}
            <span className="text-muted">
              (Class {attachedFile.classNum} · {attachedFile.subject}
              {attachedFile.paperYear ? ` · ${attachedFile.paperYear}` : ''})
            </span>
          </span>
          <button className="btn btn-sm btn-ghost" onClick={detach}>Detach</button>
        </div>
      )}
      {attachedFile && !['pdf', 'image'].includes(attachedFile.fileType) && (
        <p className="note" style={{ marginTop: '0.4rem' }}>
          Note: Word/PowerPoint files can't be read directly by the AI — it will answer
          from the file's details (name, class, subject, chapter).
        </p>
      )}

      <div className="ai-chat">
        {messages.length === 0 && !busy && (
          <div className="ai-empty">
            <p className="text-muted">
              {attachedFile
                ? 'Ask anything about the attached file — e.g. "Give me 5 more questions like these" or "Explain question 3".'
                : 'Try one of these:'}
            </p>
            {!attachedFile && (
              <div className="ai-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ai-msg user' : 'ai-msg assistant'}>
            <div className="ai-bubble">
              {m.role === 'assistant' ? <AssistantText text={m.text} /> : m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="ai-msg assistant">
            <div className="ai-bubble"><Spinner label="Thinking" /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <form
        className="ai-composer"
        onSubmit={(e) => { e.preventDefault(); send() }}
      >
        <textarea
          ref={taRef}
          rows={1}
          value={input}
          onChange={(e) => { setInput(e.target.value); autosize() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          placeholder={attachedFile ? 'Ask about this file…' : 'Ask the assistant anything…'}
          aria-label="Message the AI assistant"
          disabled={busy}
        />
        <button
          className="ai-send"
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
          title="Send"
        >
          {busy ? '·' : '➤'}
        </button>
      </form>
      <div className="ai-hint">Enter to send · Shift+Enter for a new line</div>
    </div>
  )
}
