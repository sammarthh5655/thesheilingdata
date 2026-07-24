// ---------------------------------------------------------------------------
// Local backend — used only while Firebase is not configured.
//
// Mirrors the Firebase backend's API so every feature can be exercised in a
// single browser: metadata in localStorage, file bytes in IndexedDB.
// Starts completely empty; nothing is seeded.
// ---------------------------------------------------------------------------
import { sha256Hex } from '../config.js'

const DB_KEY = 'tsd:db:v1'
const SESSION_KEY = 'tsd:session'

const emptyDb = () => ({
  users: [],
  loginLogs: [],
  files: [],
  bookmarks: {},
  reports: [],
  audit: [],
})

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    return raw ? { ...emptyDb(), ...JSON.parse(raw) } : emptyDb()
  } catch {
    return emptyDb()
  }
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

const uid = () => crypto.randomUUID()
const now = () => Date.now()
const deviceInfo = () => {
  const ua = navigator.userAgent
  const browser =
    ua.includes('Edg/') ? 'Edge' :
    ua.includes('Chrome/') ? 'Chrome' :
    ua.includes('Firefox/') ? 'Firefox' :
    ua.includes('Safari/') ? 'Safari' : 'Browser'
  const os =
    ua.includes('Windows') ? 'Windows' :
    ua.includes('Mac') ? 'macOS' :
    ua.includes('Android') ? 'Android' :
    ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' :
    ua.includes('Linux') ? 'Linux' : 'Unknown OS'
  return `${browser} on ${os}`
}

// --- IndexedDB blob store ---------------------------------------------------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tsd-files', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('blobs')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key, blob) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite')
    tx.objectStore('blobs').put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(key) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const req = db.transaction('blobs').objectStore('blobs').get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(key) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite')
    tx.objectStore('blobs').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- Auth -------------------------------------------------------------------
const listeners = new Set()

function publicProfile(u) {
  if (!u) return null
  const { passHash, salt, ...rest } = u
  return rest
}

function currentAuth() {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return null
  const u = loadDb().users.find((x) => x.id === id)
  return u ? { uid: u.id, profile: publicProfile(u) } : null
}

function emit() {
  const state = currentAuth()
  listeners.forEach((cb) => cb(state))
}

function logEvent(db, { userId, email, type, success }) {
  db.loginLogs.push({
    id: uid(), userId: userId || null, email: email || '',
    type, success, device: deviceInfo(), at: now(),
  })
}

function audit(db, admin, action, extra = {}) {
  db.audit.push({
    id: uid(),
    adminUserId: admin?.uid || 'admin-panel',
    adminName: admin?.profile?.name || 'Admin',
    action,
    ...extra,
    at: now(),
  })
}

export const localBackend = {
  mode: 'local',

  onAuth(cb) {
    listeners.add(cb)
    cb(currentAuth())
    return () => listeners.delete(cb)
  },

  refreshAuth() { emit() },

  async getAccessToken() { return null }, // no server auth in local mode

  async signUp({ name, email, password }) {
    email = email.trim().toLowerCase()
    const db = loadDb()
    if (db.users.some((u) => u.email === email)) {
      logEvent(db, { email, type: 'signup', success: false }); saveDb(db)
      throw new Error('An account with this email already exists.')
    }
    const salt = uid()
    const user = {
      id: uid(), name: name.trim(), email,
      salt, passHash: await sha256Hex(salt + password),
      role: 'student', status: 'active', verified: false,
      createdAt: now(), lastLoginAt: now(),
    }
    db.users.push(user)
    logEvent(db, { userId: user.id, email, type: 'signup', success: true })
    saveDb(db)
    localStorage.setItem(SESSION_KEY, user.id)
    emit()
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase()
    const db = loadDb()
    const user = db.users.find((u) => u.email === email)
    if (!user || user.passHash !== (await sha256Hex((user?.salt || '') + password))) {
      logEvent(db, { userId: user?.id, email, type: 'login', success: false }); saveDb(db)
      throw new Error('Incorrect email or password.')
    }
    if (user.status === 'banned') {
      logEvent(db, { userId: user.id, email, type: 'login', success: false }); saveDb(db)
      throw new Error('This account has been suspended. Contact your school administrator.')
    }
    user.lastLoginAt = now()
    logEvent(db, { userId: user.id, email, type: 'login', success: true })
    saveDb(db)
    localStorage.setItem(SESSION_KEY, user.id)
    emit()
  },

  async signInWithGoogle() {
    throw new Error('Google sign-in requires Firebase. Add your Firebase config to enable it.')
  },

  async signOutUser() {
    localStorage.removeItem(SESSION_KEY)
    emit()
  },

  async resetPassword() {
    throw new Error(
      'Local mode cannot send email. Use the direct reset below, or configure Firebase for real password-reset emails.'
    )
  },

  // Local-mode stand-in for the email reset flow (this browser only).
  async localDirectReset({ email, newPassword }) {
    email = email.trim().toLowerCase()
    const db = loadDb()
    const user = db.users.find((u) => u.email === email)
    if (!user) throw new Error('No account found with that email.')
    user.salt = uid()
    user.passHash = await sha256Hex(user.salt + newPassword)
    saveDb(db)
  },

  async resendVerification() {
    throw new Error(
      'Local mode cannot send email. Use "Mark as verified" below to simulate, or configure Firebase.'
    )
  },

  // Local-mode stand-in for clicking the emailed verification link.
  async simulateVerify() {
    const auth = currentAuth()
    if (!auth) return
    const db = loadDb()
    const user = db.users.find((u) => u.id === auth.uid)
    if (user) { user.verified = true; saveDb(db); emit() }
  },

  async reloadVerification() {
    emit()
    return currentAuth()?.profile?.verified || false
  },

  async updateName(name) {
    const auth = currentAuth()
    if (!auth) return
    const db = loadDb()
    const user = db.users.find((u) => u.id === auth.uid)
    if (user) { user.name = name.trim(); saveDb(db); emit() }
  },

  async changePassword(newPassword) {
    const auth = currentAuth()
    if (!auth) throw new Error('Not signed in.')
    const db = loadDb()
    const user = db.users.find((u) => u.id === auth.uid)
    if (!user) throw new Error('Not signed in.')
    user.salt = uid()
    user.passHash = await sha256Hex(user.salt + newPassword)
    saveDb(db)
  },

  // --- Users ---------------------------------------------------------------
  async getUser(id) {
    return publicProfile(loadDb().users.find((u) => u.id === id)) || null
  },

  async listUsers() {
    return loadDb().users.map(publicProfile).sort((a, b) => b.createdAt - a.createdAt)
  },

  async setRole(id, role, admin) {
    const db = loadDb()
    const user = db.users.find((u) => u.id === id)
    if (!user) throw new Error('User not found.')
    const from = user.role
    user.role = role
    audit(db, admin, `Changed role of ${user.name} (${user.email}) from ${from} to ${role}`, { targetUserId: id })
    saveDb(db)
    if (currentAuth()?.uid === id) emit()
  },

  async setStatus(id, status, admin) {
    const db = loadDb()
    const user = db.users.find((u) => u.id === id)
    if (!user) throw new Error('User not found.')
    user.status = status
    audit(db, admin, `${status === 'banned' ? 'Suspended' : 'Reinstated'} account of ${user.name} (${user.email})`, { targetUserId: id })
    saveDb(db)
    if (currentAuth()?.uid === id) emit()
  },

  async listLoginLogs() {
    return [...loadDb().loginLogs].sort((a, b) => b.at - a.at)
  },

  // --- Files ---------------------------------------------------------------
  async uploadFile({
    classNum, subject, chapter, file, files, user, fileType, category, paperYear,
    examType, worksheetNo,
  }) {
    const list = (files && files.length ? files : [file]).filter(Boolean)
    if (!list.length) throw new Error('No file to upload.')
    const id = uid()
    // Page 1 keeps the record id as its key so existing lookups still work;
    // later pages are stored under "<id>:<n>".
    const pages = []
    for (let i = 0; i < list.length; i++) {
      const key = i === 0 ? id : `${id}:${i}`
      await idbPut(key, list[i])
      pages.push({ path: key, name: list[i].name, size: list[i].size })
    }
    const db = loadDb()
    const record = {
      id, classNum: Number(classNum), subject, chapter: chapter.trim(),
      category: category || 'worksheet', paperYear: paperYear || null,
      examType: examType || null, worksheetNo: worksheetNo || null,
      fileName: list[0].name, fileType,
      size: list.reduce((n, f) => n + (f.size || 0), 0),
      storagePath: `local/${id}`, storageUrl: null,
      pageCount: pages.length, pages: pages.length > 1 ? pages : null,
      uploadedByUserId: user.uid, uploaderName: user.profile.name,
      uploadedAt: now(), viewCount: 0, downloadCount: 0,
    }
    db.files.push(record)
    saveDb(db)
    return record
  },

  async listFiles(classNum, subject, category = 'worksheet') {
    return loadDb().files
      .filter((f) =>
        f.classNum === Number(classNum) && f.subject === subject &&
        (f.category || 'worksheet') === category)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
  },

  async getFile(id) {
    return loadDb().files.find((f) => f.id === id) || null
  },

  async allFiles() {
    return [...loadDb().files].sort((a, b) => b.uploadedAt - a.uploadedAt)
  },

  async filesByUploader(userId) {
    return loadDb().files
      .filter((f) => f.uploadedByUserId === userId)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
  },

  async getFileUrl(record) {
    const blob = await idbGet(record.id)
    if (!blob) throw new Error('File data not found in this browser.')
    return URL.createObjectURL(blob)
  },

  async getPageUrls(record) {
    const keys = record.pages?.length ? record.pages.map((p) => p.path) : [record.id]
    const urls = []
    for (const k of keys) {
      const blob = await idbGet(k)
      if (blob) urls.push(URL.createObjectURL(blob))
    }
    if (!urls.length) throw new Error('File data not found in this browser.')
    return urls
  },

  async registerView(id) {
    const db = loadDb()
    const f = db.files.find((x) => x.id === id)
    if (f) { f.viewCount = (f.viewCount || 0) + 1; saveDb(db) }
  },

  async registerDownload(id) {
    const db = loadDb()
    const f = db.files.find((x) => x.id === id)
    if (f) { f.downloadCount = (f.downloadCount || 0) + 1; saveDb(db) }
  },

  async deleteFile(record, admin) {
    for (const k of record.pages?.length ? record.pages.map((p) => p.path) : [record.id]) {
      await idbDelete(k)
    }
    const db = loadDb()
    db.files = db.files.filter((f) => f.id !== record.id)
    db.reports = db.reports.map((r) =>
      r.fileId === record.id && r.status === 'open' ? { ...r, status: 'resolved' } : r
    )
    for (const k of Object.keys(db.bookmarks)) {
      db.bookmarks[k] = db.bookmarks[k].filter((x) => x !== record.id)
    }
    audit(db, admin, `Deleted file "${record.fileName}" (Class ${record.classNum} · ${record.subject})`, { targetFileId: record.id })
    saveDb(db)
  },

  async moveFile(record, { classNum, subject }, admin) {
    const db = loadDb()
    const f = db.files.find((x) => x.id === record.id)
    if (!f) throw new Error('File not found.')
    const from = `Class ${f.classNum} · ${f.subject}`
    f.classNum = Number(classNum)
    f.subject = subject
    audit(db, admin, `Moved file "${f.fileName}" from ${from} to Class ${classNum} · ${subject}`, { targetFileId: f.id })
    saveDb(db)
  },

  // --- Bookmarks -----------------------------------------------------------
  async listBookmarkIds(userId) {
    return loadDb().bookmarks[userId] || []
  },

  async toggleBookmark(userId, fileId) {
    const db = loadDb()
    const list = db.bookmarks[userId] || []
    const has = list.includes(fileId)
    db.bookmarks[userId] = has ? list.filter((x) => x !== fileId) : [...list, fileId]
    saveDb(db)
    return !has
  },

  // --- Reports -------------------------------------------------------------
  async createReport({ file, user, reason }) {
    const db = loadDb()
    db.reports.push({
      id: uid(), fileId: file.id, fileName: file.fileName,
      classNum: file.classNum, subject: file.subject,
      reportedByUserId: user.uid, reporterName: user.profile.name,
      reason: reason.trim(), status: 'open', createdAt: now(),
    })
    saveDb(db)
  },

  async listReports() {
    return [...loadDb().reports].sort((a, b) => b.createdAt - a.createdAt)
  },

  async setReportStatus(id, status, admin) {
    const db = loadDb()
    const r = db.reports.find((x) => x.id === id)
    if (!r) return
    r.status = status
    audit(db, admin, `${status === 'dismissed' ? 'Dismissed' : 'Resolved'} report on "${r.fileName}"`, { targetFileId: r.fileId })
    saveDb(db)
  },

  // --- Audit ---------------------------------------------------------------
  async listAudit() {
    return [...loadDb().audit].sort((a, b) => b.at - a.at)
  },

  async logAdminAction(admin, action, extra = {}) {
    const db = loadDb()
    audit(db, admin, action, extra)
    saveDb(db)
  },
}
