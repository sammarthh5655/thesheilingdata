import { useEffect, useState } from 'react'
import { backend } from '../backend/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import FileCard from '../components/FileCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Spinner from '../components/Spinner.jsx'
import ReportDialog from '../components/ReportDialog.jsx'

export default function Bookmarks() {
  const { user } = useAuth()
  const [files, setFiles] = useState(null)
  const [reporting, setReporting] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const ids = await backend.listBookmarkIds(user.uid)
      const records = (await Promise.all(ids.map((id) => backend.getFile(id))))
        .filter(Boolean)
        .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
      if (alive) setFiles(records)
    })().catch(() => alive && setFiles([]))
    return () => { alive = false }
  }, [user.uid])

  const remove = async (file) => {
    await backend.toggleBookmark(user.uid, file.id)
    setFiles((list) => list.filter((f) => f.id !== file.id))
  }

  return (
    <>
      <div className="page-head">
        <h1>My bookmarks</h1>
        <p className="sub">Files you've saved for quick access.</p>
      </div>

      {files === null ? (
        <div className="page-loading"><Spinner label="Loading bookmarks" /></div>
      ) : files.length === 0 ? (
        <EmptyState glyph="★" title="No bookmarks yet">
          Tap the ☆ on any worksheet to save it here.
        </EmptyState>
      ) : (
        <div className="file-list">
          {files.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              showLocation
              bookmarked
              onToggleBookmark={remove}
              onReport={setReporting}
            />
          ))}
        </div>
      )}

      {reporting && <ReportDialog file={reporting} onClose={() => setReporting(null)} />}
    </>
  )
}
