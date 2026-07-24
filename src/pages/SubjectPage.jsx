import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { subjectFromSlug, CLASSES, CATEGORY_QUESTION_PAPER } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import FileCard from '../components/FileCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Spinner from '../components/Spinner.jsx'
import UploadPanel from '../components/UploadPanel.jsx'
import ReportDialog from '../components/ReportDialog.jsx'
import NotFound from './NotFound.jsx'

// Also serves the Question Bank (category prop). Worksheets group by chapter;
// question papers group by academic year.
export default function SubjectPage({ category = 'worksheet' }) {
  const { classNumber, subjectSlug } = useParams()
  const subject = CLASSES[classNumber] ? subjectFromSlug(classNumber, subjectSlug) : null
  const { user, canUpload } = useAuth()
  const isQB = category === CATEGORY_QUESTION_PAPER
  const base = isQB ? '/question-bank' : '/classes'

  const [files, setFiles] = useState(null)
  const [bookmarks, setBookmarks] = useState(new Set())
  const [groupFilter, setGroupFilter] = useState('')
  const [reporting, setReporting] = useState(null)

  const load = useCallback(async () => {
    const [list, bm] = await Promise.all([
      backend.listFiles(classNumber, subject, category),
      backend.listBookmarkIds(user.uid),
    ])
    setFiles(list)
    setBookmarks(new Set(bm))
  }, [classNumber, subject, category, user.uid])

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

  // Group key: chapter for worksheets, academic year for question papers.
  const keyOf = (f) => (isQB ? f.paperYear || 'Unknown year' : f.chapter || 'Uncategorized')
  const groups = files
    ? [...new Set(files.map(keyOf))].sort((a, b) =>
        isQB ? b.localeCompare(a, undefined, { numeric: true })
             : a.localeCompare(b, undefined, { numeric: true }))
    : []
  const visible = files
    ? groupFilter ? files.filter((f) => keyOf(f) === groupFilter) : files
    : []
  const grouped = groups
    .filter((g) => !groupFilter || g === groupFilter)
    .map((g) => ({ group: g, items: visible.filter((f) => keyOf(f) === g) }))
    .filter((g) => g.items.length)

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to={base}>{isQB ? 'Question Bank' : 'Classes'}</Link>
          <span className="sep">/</span>
          <Link to={`${base}/${classNumber}`}>Class {classNumber}</Link>
          <span className="sep">/</span>
          <span>{subject}</span>
        </nav>
        <h1>{subject}{isQB ? ' — Question Papers' : ''}</h1>
        <p className="sub">
          Class {classNumber}
          {files && ` · ${files.length} ${isQB ? 'paper' : 'file'}${files.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {canUpload && (
        <UploadPanel
          classNum={Number(classNumber)}
          subject={subject}
          category={category}
          onUploaded={load}
        />
      )}

      {files === null ? (
        <div className="page-loading"><Spinner label={isQB ? 'Loading question papers' : 'Loading worksheets'} /></div>
      ) : files.length === 0 ? (
        <EmptyState glyph="✎" title={isQB ? 'No question papers uploaded yet for this subject' : 'No worksheets uploaded yet for this subject'}>
          When a teacher uploads {isQB ? 'previous-year papers' : 'material'} for {subject}, it will appear here.
        </EmptyState>
      ) : (
        <>
          {groups.length > 1 && (
            <div className="chip-row" role="group" aria-label={isQB ? 'Filter by year' : 'Filter by chapter'}>
              <button
                className={groupFilter === '' ? 'chip active' : 'chip'}
                onClick={() => setGroupFilter('')}
              >
                {isQB ? 'All years' : 'All chapters'}
              </button>
              {groups.map((g) => (
                <button
                  key={g}
                  className={groupFilter === g ? 'chip active' : 'chip'}
                  onClick={() => setGroupFilter(groupFilter === g ? '' : g)}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {grouped.map(({ group, items }) => (
            <section key={group} className="chapter-group">
              <h2 className="chapter-title">
                {group}
                <span className="tally">{items.length} {isQB ? 'paper' : 'file'}{items.length === 1 ? '' : 's'}</span>
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
