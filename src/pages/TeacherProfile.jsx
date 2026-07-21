import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatDate } from '../config.js'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import FileCard from '../components/FileCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Spinner from '../components/Spinner.jsx'
import ReportDialog from '../components/ReportDialog.jsx'

export default function TeacherProfile() {
  const { teacherId } = useParams()
  const { user } = useAuth()
  const [teacher, setTeacher] = useState(undefined)
  const [files, setFiles] = useState(null)
  const [bookmarks, setBookmarks] = useState(new Set())
  const [reporting, setReporting] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [t, list, bm] = await Promise.all([
        backend.getUser(teacherId),
        backend.filesByUploader(teacherId),
        backend.listBookmarkIds(user.uid),
      ])
      if (!alive) return
      setTeacher(t)
      setFiles(list)
      setBookmarks(new Set(bm))
    })().catch(() => { if (alive) { setTeacher(null); setFiles([]) } })
    return () => { alive = false }
  }, [teacherId, user.uid])

  if (teacher === undefined) return <div className="page-loading"><Spinner label="Loading profile" /></div>
  if (teacher === null) {
    return <EmptyState glyph="∅" title="Profile not found">This user doesn't exist.</EmptyState>
  }

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
        <h1>{teacher.name}</h1>
        <p className="sub">
          <span className={`badge ${teacher.role}`}>{teacher.role}</span>{' '}
          Member since {formatDate(teacher.createdAt)}
          {files && <> · {files.length} upload{files.length === 1 ? '' : 's'}</>}
        </p>
      </div>

      {files === null ? (
        <div className="page-loading"><Spinner label="Loading files" /></div>
      ) : files.length === 0 ? (
        <EmptyState glyph="✎" title="No uploads yet">
          {teacher.name} hasn't uploaded any material yet.
        </EmptyState>
      ) : (
        <div className="file-list">
          {files.map((f) => (
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
