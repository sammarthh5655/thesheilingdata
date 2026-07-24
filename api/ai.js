// ---------------------------------------------------------------------------
// TheSheilingData — AI Assistant endpoint (Vercel serverless function).
//
// Calls the Google Gemini REST API directly (X-goog-api-key header) with
// automatic key rotation: if one key is rate-limited or invalid, it tries the
// next one. Uses the lightweight "flash-lite" model to keep quota usage low.
//
// Set environment variables in Vercel → Project → Settings → Environment Variables:
//   GEMINI_API_KEY_1=<key>
//   GEMINI_API_KEY_2=<key>
//   ... up to GEMINI_API_KEY_20 (or a single plain GEMINI_API_KEY)
//
// Get free keys at: https://aistudio.google.com/apikey
// ---------------------------------------------------------------------------
import { callGemini, getApiKeys, getSupabaseUser } from './_gemini.js'

const MAX_QUESTION_CHARS = 4000
const MAX_HISTORY = 20
const MAX_INLINE_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_TOKENS = 4096

function systemPrompt(catalog) {
  const catalogLines = (catalog || [])
    .map((f) =>
      `- id:${f.id} | ${f.category === 'question_paper' ? 'QUESTION PAPER' : 'WORKSHEET'} | Class ${f.class} | ${f.subject}` +
      `${f.year ? ` | Year ${f.year}` : ''}${f.chapter ? ` | ${f.chapter}` : ''} | "${f.name}"`)
    .join('\n')

  return `You are the built-in AI assistant of TheSheilingData, a school website with
worksheets and previous-year question papers for classes 6-10, organized by
class, subject and chapter (worksheets) or academic year (question papers).

Site navigation you can link to (relative paths only, never full URLs):
- A specific file page: /file/<id>
- Worksheets: /classes, /classes/<classNumber>, /classes/<classNumber>/<subject-slug>
- Question Bank: /question-bank, /question-bank/<classNumber>, /question-bank/<classNumber>/<subject-slug>
(Subject slugs are the subject name lowercased with spaces as dashes, e.g. "english-literature".)

CURRENT FILE CATALOG (everything uploaded so far):
${catalogLines || '(The library is currently empty — no files have been uploaded yet.)'}

Your jobs:
1. Help users FIND material: when asked "where is X", search the catalog above and
   answer with the file name and its link (/file/<id>), or the browse path if
   nothing matches. If the exact year/subject isn't in the catalog, say so
   honestly and point to the nearest alternative.
2. Help with an ATTACHED file: if the user attached a worksheet or question
   paper, answer questions about it — explain questions, provide worked answers,
   generate extra practice questions in the same style and difficulty, make
   revision notes, or estimate the topics covered.
3. General study help for classes 6-10 in the Indian school context.

Rules:
- Be concise and friendly; you are talking to school students and teachers.
- Use plain text (no markdown tables). Keep math readable in plain text.
- When you reference a file from the catalog, include its /file/<id> link.
- Never invent files that are not in the catalog.
- Politely decline anything unrelated to studies or this website.`
}

// Fetch a PDF/image by its public URL and return Gemini inlineData (base64).
async function fetchInlineData(url, fileType) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > MAX_INLINE_BYTES) return null
    let mimeType = (r.headers.get('content-type') || '').split(';')[0].trim()
    if (fileType === 'pdf') mimeType = 'application/pdf'
    else if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg'
    return { mimeType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

async function buildContents(history, file) {
  const turns = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user', // Gemini uses 'model'
      parts: [{ text: m.text.slice(0, MAX_QUESTION_CHARS) }],
    }))
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') return null

  if (file) {
    const last = turns[turns.length - 1]
    const meta =
      `[Attached ${file.category === 'question_paper' ? 'question paper' : 'worksheet'}: ` +
      `"${file.name}" — Class ${file.classNum}, ${file.subject}` +
      `${file.paperYear ? `, Year ${file.paperYear}` : ''}${file.chapter ? `, ${file.chapter}` : ''}]`
    last.parts[0].text = `${meta}\n\n${last.parts[0].text}`
    if (file.url && (file.fileType === 'pdf' || file.fileType === 'image')) {
      const inline = await fetchInlineData(file.url, file.fileType)
      if (inline) last.parts.unshift({ inlineData: inline })
    }
  }
  return turns
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const keys = getApiKeys()
  if (keys.length === 0) {
    res.status(500).json({
      error: 'AI is not configured yet: set GEMINI_API_KEY_1 (and optionally _2, _3 …) in Vercel environment variables.',
    })
    return
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const user = await getSupabaseUser(token)
  if (!user) {
    res.status(401).json({ error: 'Please sign in to use the AI assistant.' })
    return
  }

  const { messages, file, catalog } = req.body || {}
  const contents = await buildContents(Array.isArray(messages) ? messages : [], file || null)
  if (!contents) {
    res.status(400).json({ error: 'No question provided.' })
    return
  }

  try {
    const { text } = await callGemini({
      systemPrompt: systemPrompt(Array.isArray(catalog) ? catalog.slice(0, 400) : []),
      contents,
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    })
    res.status(200).json({ reply: text || 'Sorry — I could not produce an answer. Please try again.' })
  } catch (err) {
    if (err?.status === 429) {
      res.status(429).json({ error: 'The AI assistant has reached its usage limit for now — please try again in a little while.' })
    } else {
      console.error('AI request failed', err?.status, err?.message)
      res.status(500).json({ error: 'The assistant hit an error. Please try again.' })
    }
  }
}
