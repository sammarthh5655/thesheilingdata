import { Link } from 'react-router-dom'
import { CLASSES, CLASS_NUMBERS } from '../config.js'
import { useAuth } from '../context/AuthContext.jsx'

const ROMAN = { 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' }

export default function Home() {
  const { isSignedIn } = useAuth()

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Classes 6 – 10 · Worksheets · Notes · Study material</div>
        <h1>Every worksheet, <em>in its place.</em></h1>
        <p className="lede">
          TheSheilingData is your school's organized library of worksheets and
          study material — arranged by class, subject, and chapter, uploaded by
          your own teachers.
        </p>
        <p style={{ marginTop: '1rem', fontSize: '0.95rem', opacity: 0.9 }}>Created by Sammarth Khandelwal</p>
        <div className="hero-actions">
          {isSignedIn ? (
            <Link to="/classes" className="btn btn-primary">Browse classes</Link>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary">Create your account</Link>
              <Link to="/login" className="btn">Sign in</Link>
            </>
          )}
        </div>
      </section>

      <div className="section-label">Choose your class</div>
      <div className="class-strip">
        {CLASS_NUMBERS.map((n) => (
          <Link key={n} to={isSignedIn ? `/classes/${n}` : '/login'} className="class-tile">
            <span className="roman">{ROMAN[n]}</span>
            <span>Class {n}</span>
            <div className="count">{CLASSES[n].length} subjects</div>
          </Link>
        ))}
      </div>

      <div className="section-label">How it works</div>
      <div className="how-grid">
        <div className="how-step">
          <span className="num">I.</span>
          <h3>Find your class</h3>
          <p>Pick your class, then the subject you're studying — every subject on the school syllabus is here.</p>
        </div>
        <div className="how-step">
          <span className="num">II.</span>
          <h3>Browse by chapter</h3>
          <p>Worksheets are tagged by chapter, so you can jump straight to the topic you need.</p>
        </div>
        <div className="how-step">
          <span className="num">III.</span>
          <h3>Open or save</h3>
          <p>Preview files right in the browser, download them for later, and bookmark your favourites.</p>
        </div>
      </div>
    </>
  )
}
