// Selects the active backend:
//   1. Supabase  — when src/supabase-config.js has a real url + anonKey
//   2. Firebase  — when src/firebase-config.js has a real apiKey
//   3. Local     — otherwise (this browser only), so the site can be tried.
import { isSupabaseConfigured } from '../supabase-config.js'
import { isFirebaseConfigured } from '../firebase-config.js'

let backend
if (isSupabaseConfigured()) {
  const { supabaseBackend } = await import('./supabaseBackend.js')
  backend = supabaseBackend
} else if (isFirebaseConfigured()) {
  const { firebaseBackend } = await import('./firebaseBackend.js')
  backend = firebaseBackend
} else {
  const { localBackend } = await import('./localBackend.js')
  backend = localBackend
}

export { backend }
