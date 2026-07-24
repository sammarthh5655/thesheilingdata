// ---------------------------------------------------------------------------
// TheSheilingData — automatic worksheet / question-paper classification.
//
// POST /api/classify with { action }:
//   'classify' — read an uploaded page and predict class / subject / category
//   'feedback' — store what the human actually confirmed (the learning step)
//   'seed'     — bootstrap the example bank from the existing library
//
// How it "learns": every confirmation and correction is stored in
// classification_examples, and the most relevant past examples (corrections
// first) are injected into each new prompt as few-shot examples. A single
// correction changes the next prediction — no retraining cycle required.
// ---------------------------------------------------------------------------
import {
  CLASSES, CATEGORY_WORKSHEET, CATEGORY_QUESTION_PAPER, EXAM_TYPES, EXAM_TYPE_IDS,
} from '../src/config.js'
import { callGemini, getApiKeys, getSupabaseUser, supabaseRest } from './_gemini.js'

const MAX_INLINE_BYTES = 4 * 1024 * 1024 // Vercel request bodies cap out ~4.5 MB
const MAX_EXAMPLES = 60
const MAX_SEED_FILES = 500

const ALL_SUBJECTS = [...new Set(Object.values(CLASSES).flat())]
const CLASS_KEYS = Object.keys(CLASSES)

// Gemini structured-output schema. Enums keep the model inside your real
// class/subject vocabulary instead of inventing "Physics-II" or "Class 11".
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    classNum: { type: 'STRING', enum: CLASS_KEYS },
    subject: { type: 'STRING', enum: ALL_SUBJECTS },
    category: { type: 'STRING', enum: [CATEGORY_WORKSHEET, CATEGORY_QUESTION_PAPER] },
    chapter: { type: 'STRING' },
    paperYear: { type: 'STRING' },
    // Gemini rejects an empty string inside an enum, so "unknown" is the
    // explicit opt-out and is mapped back to '' in validate().
    examType: { type: 'STRING', enum: [...EXAM_TYPE_IDS, 'unknown'] },
    worksheetNo: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    headerText: { type: 'STRING' },
    reasoning: { type: 'STRING' },
  },
  required: ['classNum', 'subject', 'category', 'confidence', 'reasoning'],
}

function structureBlock() {
  return Object.entries(CLASSES)
    .map(([cls, subs]) => `Class ${cls}: ${subs.join(', ')}`)
    .join('\n')
}

// Fetch human-verified examples, corrections weighted first.
async function fetchExamples(token) {
  try {
    const q =
      'classification_examples?select=file_name,header_text,ai_class,ai_subject,' +
      'final_class,final_subject,final_category,final_chapter,corrected' +
      `&order=corrected.desc,created_at.desc&limit=${MAX_EXAMPLES}`
    const r = await supabaseRest(q, token)
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

function examplesBlock(examples) {
  if (!examples.length) return ''
  const lines = examples.map((e) => {
    const label =
      `Class ${e.final_class} | ${e.final_subject} | ${e.final_category}` +
      `${e.final_chapter ? ` | ${e.final_chapter}` : ''}`
    const hint = e.header_text ? ` (header: "${String(e.header_text).slice(0, 90)}")` : ''
    // Corrections are shown with the wrong guess so the model learns the miss.
    if (e.corrected && e.ai_class && e.ai_subject) {
      return `- "${e.file_name}"${hint} -> ${label}   [CORRECTION: a previous guess of Class ${e.ai_class} | ${e.ai_subject} was WRONG]`
    }
    return `- "${e.file_name}"${hint} -> ${label}`
  })
  return `\nVERIFIED EXAMPLES FROM THIS SCHOOL (learn the naming and layout conventions from these; entries marked CORRECTION are past mistakes you must not repeat):\n${lines.join('\n')}\n`
}

function systemPrompt(examples) {
  return `You classify scanned school worksheets and previous-year question papers
for an Indian school library covering classes 6 to 10.

Read the page image or PDF and identify which class, subject and document type
it belongs to. Most sheets print this in a header, title block, or footer.

VALID CLASS -> SUBJECT COMBINATIONS (you MUST choose one of these exactly; never
invent a subject and never pick a subject that is not listed under that class):
${structureBlock()}
${examplesBlock(examples)}
HOW THIS SCHOOL'S SHEETS ARE LAID OUT (read from real examples — check these
header boxes FIRST, they are the most reliable evidence on the page):

A) WORKSHEETS carry a bordered header box, usually top-left, containing:
     Class: IX  Sec-B,C,D,E
     WORKSHEET No: 2
     No. of pages: 1
     Subject – Physics
     Topic: Laws of Motion
   with the academic session printed as two years either side of the school
   crest, like "2026   2027" (meaning 2026-27).

B) QUESTION PAPERS are centred under the school name:
     Sheiling House School
     1st Period Order Test 2026-27
     Class – IX
     Time: 40 Min.    Subject: Biology    M.M.: 20
   and often a footer like "(IX / Maths / 1st P.O. / Page 1 of 1)".
   "Period Order Test" (also written "P.O.") IS this school's exam name, so it
   is always a question_paper. "M.M." means Maximum Marks.

Decide "category":
- "question_paper" — a formal exam paper. Signals: maximum marks / "M.M.",
  time allowed, "Period Order Test", "General Instructions",
  board/term/annual/half-yearly wording, a printed school name banner.
- "worksheet" — practice material, homework, revision sheets, notes with
  exercises, chapter-specific drills.

DECISIVE RULE: if the header box says "WORKSHEET No", it is a worksheet — even
when the body has "Instructions:", "Section A", "Section B", or assertion-and-
reasoning questions. Some of this school's worksheets are laid out like exam
papers. Only treat it as a question_paper if there is NO "WORKSHEET No" header
AND you can see exam markers such as M.M./Maximum Marks or a Period Order Test
banner.

SUBJECT NAMING — IMPORTANT: this school's sheets often print just "Hindi" or
just "English", but the library splits each into Literature and Language. You
must choose one:
- reading passages, poems, stories, literary or comprehension questions
  (e.g. gadyansh, sakhi, Kabir couplets) -> "Hindi Literature" / "English Literature"
- grammar, vocabulary, sentence correction, letter or essay writing
  (e.g. vyakaran) -> "Hindi Language" / "English Language"
If the sheet genuinely mixes both, choose the Literature variant and set
confidence to "medium" so the teacher can correct it.
Sheets may also be photographed sideways or upside down — read them anyway.

Also extract when visible:
- "chapter": if the header box has a "Topic:" field, use its value verbatim
  (e.g. "Laws of Motion", "Co-ordinate Geometry"). Otherwise use the chapter
  name or number, formatted like "Ch 4 — Light". Leave empty if absent.
- "worksheetNo": for worksheets, just the digits from "WORKSHEET No - 2" -> "2".
  Leave empty if the sheet is not numbered.
- "paperYear": the academic year like "2024-25". A session printed as two years
  either side of the crest ("2026   2027") means "2026-27". Worksheets carry
  this session too, so read it for them as well.
- "examType": for question papers, which of the school's six examinations it is.
  Use exactly one of these ids, or the literal "unknown" if you cannot tell
  (always use "unknown" for worksheets):
${EXAM_TYPES.map((e) => `    ${e.id.padEnd(13)} = ${e.label} (normally ${e.marks.join(' or ')} marks)`).join('\n')}
  "PO" is short for "Period Order Test", so "1st Period Order Test" -> po_1 and
  "2nd Period Order Test" -> po_2. Read the maximum marks ("M.M.: 20") as
  supporting evidence: 25 marks means po_2, since no other exam uses 25. When
  the marks alone are ambiguous (10, 20 and 80 are each shared by two exams),
  rely on the printed exam name, and answer "unknown" if there is none.
- "headerText": the single most identifying line of text you saw, verbatim.

Set "confidence":
- "high"   — the class AND subject are printed on the page or unmistakable.
- "medium" — inferred confidently from the topic content or the file name.
- "low"    — genuinely unsure; the human should pick manually.

Be honest with confidence. A wrong "high" is far worse than an honest "low",
because the teacher will accept it without checking. Explain your evidence in
"reasoning" in one short sentence.`
}

// Never let the model return a subject that does not exist for that class.
function validate(parsed) {
  const out = {
    classNum: null,
    subject: null,
    category: CATEGORY_WORKSHEET,
    chapter: '',
    paperYear: '',
    examType: '',
    worksheetNo: '',
    confidence: 'low',
    headerText: '',
    reasoning: '',
    ...parsed,
  }
  // 'unknown' is the model's opt-out sentinel; anything unrecognised is dropped.
  if (!EXAM_TYPE_IDS.includes(out.examType)) out.examType = ''
  // Digits only, and no leading zeros, so "No 02" and "No 2" group together.
  out.worksheetNo = String(out.worksheetNo || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')

  const cls = String(out.classNum || '')
  const valid = CLASSES[cls]
  if (!valid) {
    return { ...out, classNum: null, subject: null, confidence: 'low' }
  }
  if (!valid.includes(out.subject)) {
    // The pair is impossible — keep the class, drop the subject, force review.
    return { ...out, classNum: cls, subject: null, confidence: 'low' }
  }
  if (out.category !== CATEGORY_QUESTION_PAPER) out.category = CATEGORY_WORKSHEET
  return { ...out, classNum: cls }
}

async function doClassify(req, res, token) {
  const { fileName, mimeType, dataBase64, fileKind, localGuess } = req.body || {}
  if (!fileName) {
    res.status(400).json({ error: 'No file provided.' })
    return
  }

  const parts = []
  let sawPage = false
  if (dataBase64 && mimeType) {
    const bytes = Math.floor((dataBase64.length * 3) / 4)
    if (bytes <= MAX_INLINE_BYTES) {
      parts.push({ inlineData: { mimeType, data: dataBase64 } })
      sawPage = true
    }
  }

  // The browser already made a guess from the file name. Pass it along as a
  // hint — it was not confident enough to use on its own, but it is evidence.
  const hint =
    localGuess?.classNum && localGuess?.subject
      ? `\n\nA file-name analysis suggested Class ${localGuess.classNum} | ${localGuess.subject} | ${localGuess.category}, but was not confident. Treat this as a hint only — the page itself is the better evidence, so overrule it if the page disagrees.`
      : ''

  // Word/PowerPoint, or a file too large to inline: classify on the name alone.
  parts.push({
    text: (sawPage
      ? `Classify this document. Its file name is "${fileName}".`
      : `No page preview is available for this ${fileKind || 'file'} — classify it from its file name alone, and set confidence to "low" unless the name is unambiguous. File name: "${fileName}".`) + hint,
  })

  const examples = await fetchExamples(token)

  let parsed
  try {
    const { text } = await callGemini({
      systemPrompt: systemPrompt(examples),
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 700,
        temperature: 0,
      },
    })
    parsed = JSON.parse(text)
  } catch (err) {
    if (err?.status === 429) {
      res.status(429).json({ error: 'Auto-detect has hit its usage limit for now — please fill the fields manually.' })
      return
    }
    console.error('classify failed', err?.status, err?.message)
    res.status(500).json({ error: 'Auto-detect is unavailable — please fill the fields manually.' })
    return
  }

  res.status(200).json({
    prediction: validate(parsed),
    learnedFrom: examples.length,
    sawPage,
  })
}

// Store what the human actually confirmed. This is the learning step.
async function doFeedback(req, res, token, user) {
  const { fileName, fileKind, headerText, prediction, final } = req.body || {}
  if (!fileName || !final?.classNum || !final?.subject) {
    res.status(400).json({ error: 'Missing classification result.' })
    return
  }

  const corrected =
    !!prediction &&
    (String(prediction.classNum) !== String(final.classNum) ||
      prediction.subject !== final.subject ||
      prediction.category !== final.category)

  const row = {
    file_name: fileName,
    file_kind: fileKind || null,
    header_text: headerText ? String(headerText).slice(0, 300) : null,
    ai_class: prediction?.classNum ? Number(prediction.classNum) : null,
    ai_subject: prediction?.subject || null,
    ai_category: prediction?.category || null,
    final_class: Number(final.classNum),
    final_subject: final.subject,
    final_category: final.category || CATEGORY_WORKSHEET,
    final_chapter: final.chapter || null,
    corrected,
    source: 'upload',
    created_by: user?.id || null,
  }

  const r = await supabaseRest('classification_examples', token, {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'return=minimal' },
  })

  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    console.error('feedback insert failed', r.status, detail)
    res.status(500).json({ error: 'Could not record the correction.' })
    return
  }
  res.status(200).json({ ok: true, corrected })
}

// Bootstrap the example bank from files already in the library. Their
// class/subject were chosen by a human, so they are ground truth — and this
// costs zero Gemini calls.
async function doSeed(req, res, token, user) {
  const r = await supabaseRest(
    'files?select=file_name,file_type,class_num,subject,category,chapter' +
      `&order=created_at.desc&limit=${MAX_SEED_FILES}`,
    token,
  )
  if (!r.ok) {
    res.status(500).json({ error: 'Could not read the existing library.' })
    return
  }
  const files = await r.json()
  if (!files.length) {
    res.status(200).json({ ok: true, seeded: 0, message: 'No files in the library yet.' })
    return
  }

  // Dedupe by file name — the unique index covers the rest.
  const seen = new Set()
  const rows = []
  for (const f of files) {
    if (!f.file_name || !f.class_num || !f.subject) continue
    if (seen.has(f.file_name)) continue
    seen.add(f.file_name)
    rows.push({
      file_name: f.file_name,
      file_kind: f.file_type || null,
      final_class: Number(f.class_num),
      final_subject: f.subject,
      final_category: f.category || CATEGORY_WORKSHEET,
      final_chapter: f.chapter || null,
      corrected: false,
      source: 'library',
      created_by: user?.id || null,
    })
  }

  const ins = await supabaseRest('classification_examples', token, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
  })
  if (!ins.ok) {
    const detail = await ins.text().catch(() => '')
    console.error('seed failed', ins.status, detail)
    res.status(500).json({ error: 'Could not seed the example bank.' })
    return
  }
  res.status(200).json({ ok: true, seeded: rows.length })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (getApiKeys().length === 0) {
    res.status(500).json({ error: 'AI is not configured: set GEMINI_API_KEY_1 in the environment.' })
    return
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const user = await getSupabaseUser(token)
  if (!user) {
    res.status(401).json({ error: 'Please sign in.' })
    return
  }

  const action = req.body?.action || 'classify'
  try {
    if (action === 'classify') return await doClassify(req, res, token)
    if (action === 'feedback') return await doFeedback(req, res, token, user)
    if (action === 'seed') return await doSeed(req, res, token, user)
    res.status(400).json({ error: `Unknown action "${action}".` })
  } catch (err) {
    console.error('classify handler error', err?.message)
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong.' })
  }
}
