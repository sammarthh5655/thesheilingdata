// ---------------------------------------------------------------------------
// Local (no-API) class / subject / category detector.
//
// Runs in the browser before any Gemini call. Most school files are named
// something like "class9_physics_ch4_light.pdf" or "X-Chem-Annual-2024-25.pdf",
// and that is enough to classify them with certainty — for free, instantly,
// and without spending a scrap of API quota.
//
// Gemini is only called when this returns low confidence (typically a camera
// photo named IMG_2317.jpg, where the file name says nothing).
// ---------------------------------------------------------------------------
import { CLASSES, CATEGORY_QUESTION_PAPER, CATEGORY_WORKSHEET, EXAM_TYPES } from '../config.js'

const MEMORY_KEY = 'tsd:classifier:memory:v1'
const MEMORY_LIMIT = 300

// --- text normalisation ----------------------------------------------------
// "Class-9_Physics(Ch4).pdf" -> " class 9 physics ch 4 pdf "
function normalize(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')      // drop the extension
    .replace(/([a-z])(\d)/g, '$1 $2')     // class9  -> class 9
    .replace(/(\d)([a-z])/g, '$1 $2')     // 9physics -> 9 physics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

// --- class number ----------------------------------------------------------
const ROMAN = { vi: 6, vii: 7, viii: 8, ix: 9, x: 10 }

function detectClass(t) {
  // "class 9", "std 9", "grade 9", "kaksha 9", "cls 9"
  const worded = t.match(/\b(?:class|cls|std|standard|grade|kaksha|katha)\s+(\d{1,2})\b/)
  if (worded) {
    const n = Number(worded[1])
    if (CLASSES[n]) return { value: n, strong: true }
  }

  // Roman numerals, but only next to a class word so "ix" inside other text
  // cannot trigger it: "class ix", "ix std"
  const roman = t.match(/\b(?:class|cls|std|standard|grade|kaksha)\s+(vi{1,3}|ix|x)\b/)
  if (roman && ROMAN[roman[1]]) return { value: ROMAN[roman[1]], strong: true }

  // "9th", "10th"
  const th = t.match(/\b(\d{1,2})\s*th\b/)
  if (th && CLASSES[Number(th[1])]) return { value: Number(th[1]), strong: true }

  // A roman numeral leading the file name: "X-Chem-Annual.pdf", "IX Physics.pdf"
  const leading = t.match(/^\s*(vi{1,3}|ix|x)\b/)
  if (leading && ROMAN[leading[1]]) return { value: ROMAN[leading[1]], strong: true }

  // A bare 6-10 anywhere is a weak hint only (could be a chapter number).
  const bare = t.match(/\b(6|7|8|9|10)\b/)
  if (bare && CLASSES[Number(bare[1])]) return { value: Number(bare[1]), strong: false }

  return { value: null, strong: false }
}

// --- subject ---------------------------------------------------------------
// Longer aliases win, so "physical education" beats "phy" -> Physics.
// Sheets often print just "Hindi" or "English" while the site splits each into
// Literature and Language. We cannot tell which from the name alone, so these
// resolve to a default but never count as a confident match — that forces a
// look at the page (or a manual pick) instead of silently guessing wrong.
const AMBIGUOUS_SUBJECTS = {
  hindi: ['Hindi Literature', 'Hindi Language'],
  english: ['English Literature', 'English Language'],
  eng: ['English Literature', 'English Language'],
}

const SUBJECT_ALIASES = {
  'Maths': ['maths', 'math', 'mathematics', 'ganit'],
  'Physics': ['physics', 'phy', 'bhautiki'],
  'Chemistry': ['chemistry', 'chem', 'rasayan'],
  'Biology': ['biology', 'bio', 'jeev vigyan'],
  'Science': ['science', 'sci', 'vigyan'],
  'History': ['history', 'hist', 'itihas'],
  'Civics': ['civics', 'civic', 'political science', 'pol sci', 'nagrik'],
  'Geography': ['geography', 'geog', 'geo', 'bhugol'],
  'Hindi Literature': ['hindi literature', 'hindi lit', 'hindi sahitya'],
  'Hindi Language': ['hindi language', 'hindi lang', 'hindi vyakaran', 'vyakaran'],
  'English Literature': ['english literature', 'eng literature', 'english lit', 'eng lit'],
  'English Language': ['english language', 'eng language', 'english lang', 'eng lang', 'grammar'],
  'French': ['french', 'francais'],
  'Sanskrit': ['sanskrit', 'sans', 'sanskritam'],
  'AI': ['artificial intelligence', 'ai'],
  'Computer': ['computer science', 'computer', 'comp sci', 'cs', 'comp'],
  'Mass Communication': ['mass communication', 'mass comm', 'masscomm'],
  'Music': ['music', 'sangeet'],
  'Fashion Designing': ['fashion designing', 'fashion design', 'fashion'],
  'Arts': ['arts', 'art', 'drawing', 'painting', 'fine art'],
  'Physical Education': ['physical education', 'phy edu', 'phys ed', 'pe', 'sports'],
}

function detectSubject(t, classNum, classStrong) {
  const allowed = classNum && CLASSES[classNum] ? CLASSES[classNum] : null
  let best = null

  for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
    // Don't offer a subject the chosen class doesn't teach.
    if (allowed && !allowed.includes(subject)) continue
    for (const alias of aliases) {
      const re = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`)
      if (re.test(t) && (!best || alias.length > best.aliasLength)) {
        best = { subject, aliasLength: alias.length }
      }
    }
  }

  if (best) {
    // Two-letter matches ("ai", "pe", "cs") are easy false positives on their
    // own, but are trustworthy when the class is spelled out alongside them.
    return { value: best.subject, strong: best.aliasLength > 2 || !!classStrong }
  }

  // Nothing specific matched. Fall back to the ambiguous bare names, which
  // deliberately never report as confident.
  for (const [alias, options] of Object.entries(AMBIGUOUS_SUBJECTS)) {
    if (!new RegExp(`\\b${alias}\\b`).test(t)) continue
    const pick = options.find((s) => !allowed || allowed.includes(s))
    if (pick) return { value: pick, strong: false, ambiguous: true }
  }

  return { value: null, strong: false }
}

// --- category, chapter, year ----------------------------------------------
const PAPER_SIGNALS = [
  'question paper', 'exam', 'examination', 'annual', 'half yearly', 'halfyearly',
  'pre board', 'preboard', 'board paper', 'sample paper', 'model paper',
  'term 1', 'term 2', 'unit test', 'periodic test', 'maximum marks',
  'time allowed', 'general instructions', 'prelim', 'final paper',
  // Sheiling House School's own exam wording, read off real papers:
  // "1st Period Order Test 2026-27", "M.M.: 20", footer "(IX / Maths / 1st P.O.)"
  'period order test', 'period order', 'order test', 'p o', 'po test',
  'm m', 'max marks', 'mm 20',
]
const SHEET_SIGNALS = ['worksheet', 'work sheet', 'ws', 'practice', 'homework', 'hw', 'assignment', 'revision', 'notes', 'abhyas']

function detectCategory(t) {
  const has = (s) => t.includes(` ${s} `)

  // A header that literally numbers the sheet ("WORKSHEET No - 2") settles it,
  // even when the body is laid out in exam-style sections. One of the school's
  // Physics worksheets has "Instructions", "Section A" and "Section B" on it.
  if (/\bworksheet\s+(no|number)\b/.test(t)) {
    return { value: CATEGORY_WORKSHEET, strong: true }
  }

  const paper = PAPER_SIGNALS.filter(has).length
  const sheet = SHEET_SIGNALS.filter(has).length
  if (paper > sheet) return { value: CATEGORY_QUESTION_PAPER, strong: true }
  if (sheet > paper) return { value: CATEGORY_WORKSHEET, strong: true }
  return { value: CATEGORY_WORKSHEET, strong: false }
}

// --- examination type ------------------------------------------------------
// normalize() splits letters from digits, so "1st P.O." arrives as "1 st p o"
// and "M.M.: 20" as "m m 20". These patterns are written against that form.
const EXAM_PATTERNS = [
  ['po_1', /\b(?:1\s*st|first)\s+(?:p\s+o|po|period\s+order)\b/],
  ['po_2', /\b(?:2\s*nd|second)\s+(?:p\s+o|po|period\s+order)\b/],
  ['assignment_1', /\b(?:1\s*st|first)\s+assignment\b|\bassignment\s+1\b/],
  ['assignment_2', /\b(?:2\s*nd|second)\s+assignment\b|\bassignment\s+2\b/],
  ['half_yearly', /\bhalf\s*yearly\b|\bhalf\s+early\b/],
  ['finals', /\b(?:finals?|annual)\b/],
]

// "M.M.: 20", "max marks 25", "mm 80"
function detectMarks(t) {
  const m = t.match(/\b(?:m\s+m|mm|max\s+marks|maximum\s+marks|marks)\s+(\d{1,3})\b/)
  return m ? Number(m[1]) : null
}

function detectExamType(t) {
  for (const [id, re] of EXAM_PATTERNS) {
    if (re.test(t)) return { value: id, strong: true }
  }

  // No name printed, but the marks may still identify it uniquely. 25 marks
  // only ever belongs to the 2nd PO; 10/20/80 are each shared by two exams,
  // so those stay unresolved rather than guessing between them.
  const marks = detectMarks(t)
  if (marks) {
    const matches = EXAM_TYPES.filter((e) => e.marks.includes(marks))
    if (matches.length === 1) return { value: matches[0].id, strong: false }
  }
  return { value: null, strong: false }
}

// "WORKSHEET No - 2", "WORKSHEET no: 1", "worksheet number 4"
function detectWorksheetNo(t) {
  const m = t.match(/\bworksheet\s+(?:no|number)\s+0*(\d{1,3})\b/)
  return m ? m[1] : ''
}

function detectChapter(t) {
  const m = t.match(/\b(?:ch|chap|chapter|lesson|unit)\s+(\d{1,2})\b/)
  return m ? `Ch ${m[1]}` : ''
}

function detectYear(t) {
  // "2024-25" / "2024 25"
  const short = t.match(/\b(20\d{2})\s+(\d{2})\b/)
  if (short) return `${short[1]}-${short[2]}`

  // The school's sheets print the session as two full years either side of the
  // crest: "2026    2027". Only accept consecutive years so a stray pair of
  // numbers cannot be mistaken for a session.
  const long = t.match(/\b(20\d{2})\s+(20\d{2})\b/)
  if (long && Number(long[2]) === Number(long[1]) + 1) {
    return `${long[1]}-${String(Number(long[2]) % 100).padStart(2, '0')}`
  }
  return ''
}

// --- learned memory (localStorage) ----------------------------------------
// Every confirmation is remembered here too, so repeat naming patterns from
// the same teacher get recognised without any network call at all.
function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function rememberExample({ fileName, classNum, subject, category, chapter }) {
  try {
    const tokens = normalize(fileName).trim().split(/\s+/).filter((w) => w.length > 1)
    if (!tokens.length) return
    const mem = loadMemory().filter((e) => e.fileName !== fileName)
    mem.unshift({
      fileName, tokens,
      classNum: Number(classNum), subject,
      category: category || CATEGORY_WORKSHEET,
      chapter: chapter || '',
    })
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem.slice(0, MEMORY_LIMIT)))
  } catch {
    /* storage full or disabled — memory is a bonus, never required */
  }
}

export function memorySize() {
  return loadMemory().length
}

// Jaccard overlap against remembered file names.
function matchMemory(t) {
  const tokens = new Set(t.trim().split(/\s+/).filter((w) => w.length > 1))
  if (!tokens.size) return null

  let best = null
  for (const e of loadMemory()) {
    const other = new Set(e.tokens)
    let shared = 0
    for (const tok of tokens) if (other.has(tok)) shared++
    const score = shared / (tokens.size + other.size - shared)
    if (score > 0.6 && (!best || score > best.score)) best = { ...e, score }
  }
  return best
}

// ---------------------------------------------------------------------------
// Main entry. Returns the same shape as the server predictor so the UI can
// render either interchangeably.
// ---------------------------------------------------------------------------
export function classifyLocally(fileName, extraText = '') {
  const t = normalize(`${fileName} ${extraText}`)

  // A near-identical name we've confirmed before beats any heuristic.
  const remembered = matchMemory(t)
  if (remembered && CLASSES[remembered.classNum]?.includes(remembered.subject)) {
    return {
      classNum: String(remembered.classNum),
      subject: remembered.subject,
      category: remembered.category,
      chapter: remembered.chapter || detectChapter(t),
      paperYear: detectYear(t),
      examType: detectExamType(t).value,
      worksheetNo: detectWorksheetNo(t),
      confidence: 'high',
      headerText: '',
      reasoning: `Matches "${remembered.fileName}", which you classified before.`,
      source: 'memory',
    }
  }

  const cls = detectClass(t)
  const subject = detectSubject(t, cls.value, cls.strong)
  const category = detectCategory(t)
  const chapter = detectChapter(t)
  const paperYear = detectYear(t)
  const exam = detectExamType(t)
  const worksheetNo = detectWorksheetNo(t)

  // Only trust the pair when the class and subject are both properly stated.
  const bothStrong = cls.strong && subject.strong && cls.value && subject.value
  const pairValid = cls.value && subject.value && CLASSES[cls.value]?.includes(subject.value)

  let confidence = 'low'
  if (bothStrong && pairValid) confidence = 'high'
  else if (pairValid) confidence = 'medium'

  const bits = []
  if (cls.value) bits.push(`class ${cls.value}`)
  if (subject.value) bits.push(subject.value.toLowerCase())
  if (category.strong) bits.push(category.value === CATEGORY_QUESTION_PAPER ? 'exam wording' : 'worksheet wording')

  if (exam.strong) bits.push(`${exam.value.replace(/_/g, ' ')}`)

  return {
    classNum: pairValid ? String(cls.value) : null,
    subject: pairValid ? subject.value : null,
    category: category.value,
    chapter,
    paperYear,
    examType: exam.value,
    worksheetNo,
    confidence,
    headerText: '',
    reasoning: bits.length
      ? `Read from the file name (${bits.join(', ')}).`
      : 'The file name gives no clue about the class or subject.',
    source: 'local',
  }
}
