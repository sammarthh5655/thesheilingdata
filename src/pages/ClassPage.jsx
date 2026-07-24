import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CLASSES, slugify, CATEGORY_QUESTION_PAPER } from '../config.js'
import { backend } from '../backend/index.js'
import NotFound from './NotFound.jsx'

// Also serves the Question Bank (category prop switches data + links).
export default function ClassPage({ category = 'worksheet' }) {
  const { classNumber } = useParams()
  const subjects = CLASSES[classNumber]
  const [counts, setCounts] = useState(null)
  const isQB = category === CATEGORY_QUESTION_PAPER
  const base = isQB ? '/question-bank' : '/classes'

  useEffect(() => {
    if (!subjects) return
    let alive = true
    backend.allFiles().then((files) => {
      if (!alive) return
      const map = {}
      for (const f of files) {
        if (f.classNum === Number(classNumber) && (f.category || 'worksheet') === category) {
          map[f.subject] = (map[f.subject] || 0) + 1
        }
      }
      setCounts(map)
    }).catch(() => setCounts({}))
    return () => { alive = false }
  }, [classNumber, subjects, category])

  if (!subjects) return <NotFound />

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to={base}>{isQB ? 'Question Bank' : 'Classes'}</Link>
          <span className="sep">/</span>
          <span>Class {classNumber}</span>
        </nav>
        <h1>Class {classNumber}{isQB ? ' · Question Bank' : ''}</h1>
        <p className="sub">{subjects.length} subjects</p>
      </div>

      <div className="card-grid">
        {subjects.map((s) => (
          <Link key={s} to={`${base}/${classNumber}/${slugify(s)}`} className="subject-card">
            <h3>{s}</h3>
            <span className="meta">
              {counts === null
                ? '…'
                : counts[s]
                  ? `${counts[s]} ${isQB ? 'paper' : 'file'}${counts[s] === 1 ? '' : 's'}`
                  : isQB ? 'No papers yet' : 'No files yet'}
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
