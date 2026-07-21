import { Link } from 'react-router-dom'
import { formatDate, formatBytes } from '../config.js'

const TYPE_LABEL = {
  image: 'IMG', pdf: 'PDF', document: 'DOC', presentation: 'PPT', other: 'FILE',
}

export default function FileCard({ file, bookmarked, onToggleBookmark, onReport, showLocation = false }) {
  return (
    <article className="file-card">
      <div className="type-badge" aria-hidden="true">{TYPE_LABEL[file.fileType] || 'FILE'}</div>
      <div className="file-info">
        <Link to={`/file/${file.id}`} className="file-name">{file.fileName}</Link>
        <div className="file-meta">
          {showLocation && <span>Class {file.classNum} · {file.subject}</span>}
          {file.chapter && <span>Ch: {file.chapter}</span>}
          <span>
            by <Link to={`/teacher/${file.uploadedByUserId}`}>{file.uploaderName}</Link>
          </span>
          <span>{formatDate(file.uploadedAt)}</span>
          <span>{formatBytes(file.size)}</span>
          <span title="Views">◉ {file.viewCount || 0}</span>
          <span title="Downloads">↓ {file.downloadCount || 0}</span>
        </div>
      </div>
      <div className="file-actions">
        {onToggleBookmark && (
          <button
            className={bookmarked ? 'icon-btn saved' : 'icon-btn'}
            onClick={() => onToggleBookmark(file)}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this file'}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            {bookmarked ? '★' : '☆'}
          </button>
        )}
        {onReport && (
          <button
            className="icon-btn"
            onClick={() => onReport(file)}
            aria-label="Report a problem with this file"
            title="Report a problem"
          >
            ⚑
          </button>
        )}
      </div>
    </article>
  )
}
