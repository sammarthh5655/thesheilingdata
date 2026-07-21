import { Link } from 'react-router-dom'
import { CLASSES, CLASS_NUMBERS } from '../config.js'

const ROMAN = { 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' }

export default function Classes() {
  return (
    <>
      <div className="page-head">
        <h1>Classes</h1>
        <p className="sub">Pick your class to see its subjects and worksheets.</p>
      </div>
      <div className="class-strip">
        {CLASS_NUMBERS.map((n) => (
          <Link key={n} to={`/classes/${n}`} className="class-tile">
            <span className="roman">{ROMAN[n]}</span>
            <span>Class {n}</span>
            <div className="count">{CLASSES[n].length} subjects</div>
          </Link>
        ))}
      </div>
    </>
  )
}
