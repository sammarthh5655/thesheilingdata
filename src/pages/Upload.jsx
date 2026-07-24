import { useState } from 'react'
import { Link } from 'react-router-dom'
import UploadPanel from '../components/UploadPanel.jsx'
import {
  CLASSES, CATEGORY_WORKSHEET, CATEGORY_QUESTION_PAPER, slugify,
} from '../config.js'

// Standalone upload page: drop any file and let auto-detection work out where
// it belongs, instead of first navigating to the right class and subject.
export default function Upload() {
  const [category, setCategory] = useState(CATEGORY_WORKSHEET)
  const [lastUpload, setLastUpload] = useState(null)

  const isQB = category === CATEGORY_QUESTION_PAPER

  return (
    <>
      <div className="page-head">
        <h1>Upload</h1>
        <p className="sub">
          Drop a worksheet or question paper here — its class and subject are
          detected automatically. Confirm the result, or set it yourself.
        </p>
      </div>

      <div className="upload-switch" role="tablist" aria-label="What are you uploading?">
        <button
          type="button"
          role="tab"
          aria-selected={!isQB}
          className={!isQB ? 'upload-switch-btn active' : 'upload-switch-btn'}
          onClick={() => setCategory(CATEGORY_WORKSHEET)}
        >
          Worksheet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isQB}
          className={isQB ? 'upload-switch-btn active' : 'upload-switch-btn'}
          onClick={() => setCategory(CATEGORY_QUESTION_PAPER)}
        >
          Question paper
        </button>
      </div>

      <UploadPanel
        key={category}
        classNum={6}
        subject={CLASSES[6][0]}
        category={category}
        onUploaded={(record) => setLastUpload(record || null)}
      />

      {lastUpload && (
        <p className="note">
          Uploaded to{' '}
          <Link
            to={`${isQB ? '/question-bank' : '/classes'}/${lastUpload.classNum}/${slugify(lastUpload.subject)}`}
          >
            Class {lastUpload.classNum} · {lastUpload.subject}
          </Link>
          .
        </p>
      )}
    </>
  )
}
