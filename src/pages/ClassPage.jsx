import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CLASSES, slugify } from '../config.js'
import { backend } from '../backend/index.js'
import NotFound from './NotFound.jsx'

export default function ClassPage() {
  const { classNumber } = useParams()
  const subjects = CLASSES[classNumber]
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    if (!subjects) return
    let alive = true
    backend.allFiles().then((files) => {
      if (!alive) return
      const map = {}
      for (const f of files) {
        if (f.classNum === Number(classNumber)) {
          map[f.subject] = (map[f.subject] || 0) + 1
        }
      }
      setCounts(map)
    }).catch(() => setCounts({}))
    return () => { alive = false }
  }, [classNumber, subjects])

  if (!subjects) return <NotFound />

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/classes">Classes</Link>
          <span className="sep">/</span>
          <span>Class {classNumber}</span>
        </nav>
        <h1>Class {classNumber}</h1>
        <p className="sub">{subjects.length} subjects</p>
      </div>

      <div className="card-grid">
        {subjects.map((s) => (
          <Link key={s} to={`/classes/${classNumber}/${slugify(s)}`} className="subject-card">
            <h3>{s}</h3>
            <span className="meta">
              {counts === null
                ? '…'
                : counts[s]
                  ? `${counts[s]} file${counts[s] === 1 ? '' : 's'}`
                  : 'No files yet'}
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
