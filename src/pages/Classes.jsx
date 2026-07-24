import { Link } from 'react-router-dom'
import { CLASSES, CLASS_NUMBERS, CATEGORY_QUESTION_PAPER } from '../config.js'

const ROMAN = { 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' }

// Also used for the Question Bank landing page (category prop).
export default function Classes({ category = 'worksheet' }) {
  const isQB = category === CATEGORY_QUESTION_PAPER
  const base = isQB ? '/question-bank' : '/classes'
  return (
    <>
      <div className="page-head">
        <h1>{isQB ? 'Question Bank' : 'Classes'}</h1>
        <p className="sub">
          {isQB
            ? 'Previous-year question papers, organized by class, subject and year.'
            : 'Pick your class to see its subjects and worksheets.'}
        </p>
      </div>
      <div className="class-strip">
        {CLASS_NUMBERS.map((n) => (
          <Link key={n} to={`${base}/${n}`} className="class-tile">
            <span className="roman">{ROMAN[n]}</span>
            <span>Class {n}</span>
            <div className="count">{CLASSES[n].length} subjects</div>
          </Link>
        ))}
      </div>
    </>
  )
}
