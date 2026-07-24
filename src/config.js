// ---------------------------------------------------------------------------
// TheSheilingData — site configuration
// ---------------------------------------------------------------------------

// Exact class → subject structure. Do not reorder or rename: URLs are derived
// from these names and existing uploads reference them verbatim.
export const CLASSES = {
  6: [
    'Maths', 'Science', 'History', 'Civics', 'Geography',
    'Hindi Literature', 'Hindi Language', 'English Literature',
    'English Language', 'French', 'Sanskrit', 'AI',
  ],
  7: [
    'Maths', 'Chemistry', 'Physics', 'Biology', 'History', 'Civics',
    'Geography', 'Hindi Literature', 'Hindi Language', 'English Literature',
    'English Language', 'French', 'Sanskrit', 'AI',
  ],
  8: [
    'Maths', 'Chemistry', 'Physics', 'Biology', 'History', 'Civics',
    'Geography', 'Hindi Literature', 'Hindi Language', 'English Literature',
    'English Language', 'French', 'Sanskrit', 'AI',
  ],
  9: [
    'Maths', 'Chemistry', 'Physics', 'Biology', 'History', 'Civics',
    'Geography', 'Hindi Literature', 'Hindi Language', 'English Literature',
    'English Language', 'Computer', 'Mass Communication', 'Music',
    'Fashion Designing', 'Arts', 'Physical Education',
  ],
  10: [
    'Maths', 'Chemistry', 'Physics', 'Biology', 'History', 'Civics',
    'Geography', 'Hindi Literature', 'Hindi Language', 'English Literature',
    'English Language', 'Computer', 'Mass Communication', 'Music',
    'Fashion Designing', 'Arts', 'Physical Education',
  ],
}

export const CLASS_NUMBERS = [6, 7, 8, 9, 10]

// ---------------------------------------------------------------------------
// File categories — worksheets vs previous-year question papers.
// Files without a category (older uploads) are treated as worksheets.
// ---------------------------------------------------------------------------
export const CATEGORY_WORKSHEET = 'worksheet'
export const CATEGORY_QUESTION_PAPER = 'question_paper'

// Academic-year labels for question papers, newest first: "2025-26", ...
export function paperYears() {
  const now = new Date()
  // Academic year starts in April; before April we're still in last year's session.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const years = []
  for (let y = startYear; y >= startYear - 14; y--) {
    years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`)
  }
  return years
}

// ---------------------------------------------------------------------------
// Examination types used by the school, in the order they fall in the year.
// "marks" lists the maximum marks each is normally set for — it is what lets
// auto-detection read "M.M.: 25" off a paper and narrow down which exam it is.
// ---------------------------------------------------------------------------
export const EXAM_TYPES = [
  { id: 'assignment_1', label: '1st Assignment', marks: [10] },
  { id: 'assignment_2', label: '2nd Assignment', marks: [10] },
  { id: 'po_1', label: '1st PO', marks: [20] },
  { id: 'po_2', label: '2nd PO', marks: [20, 25] },
  { id: 'half_yearly', label: 'Half Yearly', marks: [80] },
  { id: 'finals', label: 'Finals', marks: [80] },
]

export const EXAM_TYPE_IDS = EXAM_TYPES.map((e) => e.id)

export const examTypeLabel = (id) =>
  EXAM_TYPES.find((e) => e.id === id)?.label || null

export const slugify = (s) => s.toLowerCase().replace(/\s+/g, '-')

export const subjectFromSlug = (classNum, slug) =>
  (CLASSES[classNum] || []).find((s) => slugify(s) === slug) || null

// ---------------------------------------------------------------------------
// Admin panel — reachable at /`ADMIN_PATH`/login and /`ADMIN_PATH`/dashboard,
// or via the secret footer gesture (5 quick taps). It is never linked from
// site navigation. The real protection is the credential gate below plus the
// admin role, so a simple path like "admin" is fine.
//
// ADMIN_ID_SHA256 / ADMIN_PASS_SHA256 are SHA-256 hex digests of the admin
// panel ID and password (checked on top of normal authentication — in
// Supabase/Firebase mode the signed-in account must ALSO have role "admin").
//
// Defaults (CHANGE BEFORE DEPLOYING — see README):
//   ID: registrar     Password: change-me-now
// Generate a new digest in any browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-secret'))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
// ---------------------------------------------------------------------------
export const ADMIN_PATH = 'admin'
export const ADMIN_ID_SHA256 =
  'c1c224b03cd9bc7b6a86d77f5dace40191766c485cd55dc48caf9ac873335d6f'
export const ADMIN_PASS_SHA256 =
  '78dd405e7a5b793b2fcc86acd21276429f783c309ac0d0633e8eb983de95c1ea'

// Digests of the shipped defaults, used only to warn the admin to change them.
export const DEFAULT_ADMIN_DIGESTS = [
  'fe0b2b99bdf70b3bd86e2e3e3867b24995378cc82ebe4b1c934a1962d8690a09',
  'ccc0b903bce51fb554262d742d0a282e1f8a87d064f1cf44f8ff5148ca4beb42',
]

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.ppt', '.pptx',
]
export const MAX_FILE_MB = 25

export function fileKind(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (['.doc', '.docx'].includes(ext)) return 'document'
  if (['.ppt', '.pptx'].includes(ext)) return 'presentation'
  return 'other'
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDate(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
