import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import FileCard from '../components/FileCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Spinner from '../components/Spinner.jsx'
import ReportDialog from '../components/ReportDialog.jsx'

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const { user } = useAuth()

  const [results, setResults] = useState(null)
  const [bookmarks, setBookmarks] = useState(new Set())
  const [reporting, setReporting] = useState(null)

  useEffect(() => {
    let alive = true
    if (!q) { setResults([]); return }
    setResults(null)
    ;(async () => {
      const [files, bm] = await Promise.all([
        backend.allFiles(),
        backend.listBookmarkIds(user.uid),
      ])
      if (!alive) return
      const needle = q.toLowerCase()
      setResults(files.filter((f) =>
        f.fileName.toLowerCase().includes(needle) ||
        f.subject.toLowerCase().includes(needle) ||
        (f.chapter || '').toLowerCase().includes(needle) ||
        `class ${f.classNum}`.includes(needle) ||
        String(f.classNum) === needle
      ))
      setBookmarks(new Set(bm))
    })().catch(() => alive && setResults([]))
    return () => { alive = false }
  }, [q, user.uid])

  const toggleBookmark = async (file) => {
    const saved = await backend.toggleBookmark(user.uid, file.id)
    setBookmarks((prev) => {
      const next = new Set(prev)
      saved ? next.add(file.id) : next.delete(file.id)
      return next
    })
  }

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
        <p className="sub">{q ? <>Results for “{q}”</> : 'Type a search above to find worksheets.'}</p>
      </div>

      {!q ? null : results === null ? (
        <div className="page-loading"><Spinner label="Searching" /></div>
      ) : results.length === 0 ? (
        <EmptyState glyph="⌕" title="Nothing found">
          No worksheets match “{q}”. Try a file name, subject, chapter, or class number.
        </EmptyState>
      ) : (
        <div className="file-list">
          {results.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              showLocation
              bookmarked={bookmarks.has(f.id)}
              onToggleBookmark={toggleBookmark}
              onReport={setReporting}
            />
          ))}
        </div>
      )}

      {reporting && <ReportDialog file={reporting} onClose={() => setReporting(null)} />}
    </>
  )
}
