// ---------------------------------------------------------------------------
// Shared Gemini + Supabase helpers for the api/ functions.
//
// Files prefixed with "_" are not exposed as routes by Vercel.
// ---------------------------------------------------------------------------
import { supabaseConfig } from '../src/supabase-config.js'

export const MODEL = 'gemini-flash-lite-latest'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Collect all GEMINI_API_KEY_N variables from the environment.
export function getApiKeys() {
  const keys = []
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]
    if (k) keys.push(k.trim())
  }
  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY.trim())
  }
  return keys
}

// Returns the Supabase user object, or null when the token is missing/invalid.
export async function getSupabaseUser(token) {
  if (!token) return null
  try {
    const r = await fetch(`${supabaseConfig.url}/auth/v1/user`, {
      headers: { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// Call the Supabase REST API as the signed-in user (so RLS applies).
export async function supabaseRest(path, token, options = {}) {
  const r = await fetch(`${supabaseConfig.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return r
}

// Try each API key in turn, rotating on quota/auth errors. Returns the raw
// response text of the first candidate. Throws an Error with .status set.
export async function callGemini({ contents, systemPrompt, generationConfig }) {
  const keys = getApiKeys()
  if (keys.length === 0) {
    const err = new Error('No Gemini API keys configured')
    err.status = 500
    throw err
  }

  const body = JSON.stringify({
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    contents,
    generationConfig: generationConfig || {},
  })

  let lastStatus = null
  let lastMsg = ''
  for (const key of keys) {
    let r
    try {
      r = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body,
      })
    } catch (e) {
      lastStatus = 0
      lastMsg = String(e?.message || 'network error')
      continue // network hiccup — try the next key
    }

    if (r.ok) {
      const j = await r.json()
      const text = (j.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim()
      return { text, raw: j }
    }

    const j = await r.json().catch(() => ({}))
    lastStatus = r.status
    lastMsg = j.error?.message || ''

    // Rotate only on quota (429) / auth (401,403). Other errors (e.g. a 400
    // bad request) would fail identically on every key, so stop early.
    if (r.status === 429 || r.status === 401 || r.status === 403) continue
    break
  }

  const err = new Error(lastMsg || 'AI request failed')
  err.status = lastStatus
  throw err
}
