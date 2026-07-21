import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { subjectFromSlug, CLASSES } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import FileCard from '../components/FileCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Spinner from '../components/Spinner.jsx'
import UploadPanel from '../components/UploadPanel.jsx'
import ReportDialog from '../components/ReportDialog.jsx'
import NotFound from './NotFound.jsx'

export default function SubjectPage() {
  const { classNumber, subjectSlug } = useParams()
  const subject = CLASSES[classNumber] ? subjectFromSlug(classNumber, subjectSlug) : null
  const { user, canUpload } = useAuth()

  const [files, setFiles] = useState(null)
  const [bookmarks, setBookmarks] = useState(new Set())
  const [chapterFilter, setChapterFilter] = useState('')
  const [reporting, setReporting] = useState(null)

  const load = useCallback(async () => {
    const [list, bm] = await Promise.all([
      backend.listFiles(classNumber, subject),
      backend.listBookmarkIds(user.uid),
    ])
    setFiles(list)
    setBookmarks(new Set(bm))
  }, [classNumber, subject, user.uid])

  useEffect(() => {
    if (!subject) return
    let alive = true
    load().catch(() => alive && setFiles([]))
    return () => { alive = false }
  }, [subject, load])

  if (!subject) return <NotFound />

  const toggleBookmark = async (file) => {
    const saved = await backend.toggleBookmark(user.uid, file.id)
    setBookmarks((prev) => {
      const next = new Set(prev)
      saved ? next.add(file.id) : next.delete(file.id)
      return next
    })
  }

  const chapters = files
    ? [...new Set(files.map((f) => f.chapter || 'Uncategorized'))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }))
    : []
  const visible = files
    ? chapterFilter
      ? files.filter((f) => (f.chapter || 'Uncategorized') === chapterFilter)
      : files
    : []
  const grouped = chapters
    .filter((c) => !chapterFilter || c === chapterFilter)
    .map((c) => ({
      chapter: c,
      items: visible.filter((f) => (f.chapter || 'Uncategorized') === c),
    }))
    .filter((g) => g.items.length)

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/classes">Classes</Link>
          <span className="sep">/</span>
          <Link to={`/classes/${classNumber}`}>Class {classNumber}</Link>
          <span className="sep">/</span>
          <span>{subject}</span>
        </nav>
        <h1>{subject}</h1>
        <p className="sub">
          Class {classNumber}{files && ` · ${files.length} file${files.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {canUpload && (
        <UploadPanel classNum={Number(classNumber)} subject={subject} onUploaded={load} />
      )}

      {files === null ? (
        <div className="page-loading"><Spinner label="Loading worksheets" /></div>
      ) : files.length === 0 ? (
        <EmptyState glyph="✎" title="No worksheets uploaded yet for this subject">
          When a teacher uploads material for {subject}, it will appear here.
        </EmptyState>
      ) : (
        <>
          {chapters.length > 1 && (
            <div className="chip-row" role="group" aria-label="Filter by chapter">
              <button
                className={chapterFilter === '' ? 'chip active' : 'chip'}
                onClick={() => setChapterFilter('')}
              >
                All chapters
              </button>
              {chapters.map((c) => (
                <button
                  key={c}
                  className={chapterFilter === c ? 'chip active' : 'chip'}
                  onClick={() => setChapterFilter(chapterFilter === c ? '' : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {grouped.map(({ chapter, items }) => (
            <section key={chapter} className="chapter-group">
              <h2 className="chapter-title">
                {chapter}
                <span className="tally">{items.length} file{items.length === 1 ? '' : 's'}</span>
              </h2>
              <div className="file-list">
                {items.map((f) => (
                  <FileCard
                    key={f.id}
                    file={f}
                    bookmarked={bookmarks.has(f.id)}
                    onToggleBookmark={toggleBookmark}
                    onReport={setReporting}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {reporting && <ReportDialog file={reporting} onClose={() => setReporting(null)} />}
    </>
  )
}
