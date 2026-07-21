// ---------------------------------------------------------------------------
// Firebase backend — Auth + Firestore + Storage.
// Active whenever src/firebase-config.js contains a real config.
// ---------------------------------------------------------------------------
import { initializeApp } from 'firebase/app'
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile,
} from 'firebase/auth'
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, getDocs, query, where, serverTimestamp, increment,
} from 'firebase/firestore'
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage'
import { firebaseConfig } from '../firebase-config.js'
import { slugify } from '../config.js'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

const ts = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v || null)

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

function normalizeUser(id, d) {
  if (!d) return null
  return {
    id, name: d.name, email: d.email, role: d.role, status: d.status,
    verified: !!d.verified, createdAt: ts(d.createdAt), lastLoginAt: ts(d.lastLoginAt),
  }
}

function normalizeFile(id, d) {
  if (!d) return null
  return { id, ...d, uploadedAt: ts(d.uploadedAt) }
}

async function logEvent({ userId, email, type, success }) {
  try {
    await addDoc(collection(db, 'loginLogs'), {
      userId: userId || null, email: email || '', type, success,
      device: deviceInfo(), at: serverTimestamp(),
    })
  } catch (e) {
    console.warn('login log failed', e)
  }
}

async function writeAudit(admin, action, extra = {}) {
  await addDoc(collection(db, 'adminAuditLog'), {
    adminUserId: admin?.uid || 'admin-panel',
    adminName: admin?.profile?.name || 'Admin',
    action, ...extra, at: serverTimestamp(),
  })
}

async function ensureProfile(fbUser, name) {
  const refDoc = doc(db, 'users', fbUser.uid)
  const snap = await getDoc(refDoc)
  if (!snap.exists()) {
    await setDoc(refDoc, {
      name: name || fbUser.displayName || fbUser.email.split('@')[0],
      email: fbUser.email,
      role: 'student',           // every new account starts as a student
      status: 'active',
      verified: fbUser.emailVerified,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    })
    return true // newly created
  }
  return false
}

export const firebaseBackend = {
  mode: 'firebase',

  onAuth(cb) {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { cb(null); return }
      try {
        const snap = await getDoc(doc(db, 'users', fbUser.uid))
        let profile = normalizeUser(fbUser.uid, snap.data())
        // Keep Firestore's verified flag in step with Firebase Auth.
        if (profile && fbUser.emailVerified && !profile.verified) {
          await updateDoc(doc(db, 'users', fbUser.uid), { verified: true })
          profile = { ...profile, verified: true }
        }
        cb({ uid: fbUser.uid, profile })
      } catch (e) {
        console.error('profile load failed', e)
        cb({ uid: fbUser.uid, profile: null })
      }
    })
  },

  async refreshAuth() {
    await auth.currentUser?.reload()
    // onAuthStateChanged does not re-fire on reload; callers re-fetch via getUser.
  },

  async signUp({ name, email, password }) {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await updateProfile(cred.user, { displayName: name.trim() })
    await ensureProfile(cred.user, name.trim())
    await sendEmailVerification(cred.user)
    await logEvent({ userId: cred.user.uid, email: cred.user.email, type: 'signup', success: true })
  },

  async signIn({ email, password }) {
    let cred
    try {
      cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (e) {
      await logEvent({ email: email.trim(), type: 'login', success: false })
      throw new Error('Incorrect email or password.')
    }
    const snap = await getDoc(doc(db, 'users', cred.user.uid))
    if (snap.exists() && snap.data().status === 'banned') {
      await logEvent({ userId: cred.user.uid, email: cred.user.email, type: 'login', success: false })
      await signOut(auth)
      throw new Error('This account has been suspended. Contact your school administrator.')
    }
    await updateDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() })
    await logEvent({ userId: cred.user.uid, email: cred.user.email, type: 'login', success: true })
  },

  async signInWithGoogle() {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider())
    const isNew = await ensureProfile(cred.user)
    const snap = await getDoc(doc(db, 'users', cred.user.uid))
    if (snap.exists() && snap.data().status === 'banned') {
      await logEvent({ userId: cred.user.uid, email: cred.user.email, type: 'login', success: false })
      await signOut(auth)
      throw new Error('This account has been suspended. Contact your school administrator.')
    }
    if (!isNew) await updateDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() })
    await logEvent({
      userId: cred.user.uid, email: cred.user.email,
      type: isNew ? 'signup' : 'login', success: true,
    })
  },

  async signOutUser() {
    await signOut(auth)
  },

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email.trim())
  },

  async resendVerification() {
    if (!auth.currentUser) throw new Error('Not signed in.')
    await sendEmailVerification(auth.currentUser)
  },

  async simulateVerify() {
    throw new Error('Not available in Firebase mode — use the emailed verification link.')
  },

  async reloadVerification() {
    if (!auth.currentUser) return false
    await auth.currentUser.reload()
    if (auth.currentUser.emailVerified) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { verified: true })
      return true
    }
    return false
  },

  async updateName(name) {
    if (!auth.currentUser) return
    await updateProfile(auth.currentUser, { displayName: name.trim() })
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { name: name.trim() })
  },

  async changePassword() {
    throw new Error('Use "Send password reset email" — Firebase requires a fresh sign-in to change passwords directly.')
  },

  // --- Users ---------------------------------------------------------------
  async getUser(id) {
    const snap = await getDoc(doc(db, 'users', id))
    return snap.exists() ? normalizeUser(id, snap.data()) : null
  },

  async listUsers() {
    const snap = await getDocs(collection(db, 'users'))
    return snap.docs
      .map((d) => normalizeUser(d.id, d.data()))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  },

  async setRole(id, role, admin) {
    const target = await this.getUser(id)
    await updateDoc(doc(db, 'users', id), { role })
    await writeAudit(admin, `Changed role of ${target?.name} (${target?.email}) from ${target?.role} to ${role}`, { targetUserId: id })
  },

  async setStatus(id, status, admin) {
    const target = await this.getUser(id)
    await updateDoc(doc(db, 'users', id), { status })
    await writeAudit(admin, `${status === 'banned' ? 'Suspended' : 'Reinstated'} account of ${target?.name} (${target?.email})`, { targetUserId: id })
  },

  async listLoginLogs() {
    const snap = await getDocs(collection(db, 'loginLogs'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data(), at: ts(d.data().at) }))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
  },

  // --- Files ---------------------------------------------------------------
  async uploadFile({ classNum, subject, chapter, file, user, fileType }) {
    const id = crypto.randomUUID()
    const path = `worksheets/class-${classNum}/${slugify(subject)}/${id}-${file.name}`
    const ref = storageRef(storage, path)
    await uploadBytes(ref, file)
    const url = await getDownloadURL(ref)
    const record = {
      classNum: Number(classNum), subject, chapter: chapter.trim(),
      fileName: file.name, fileType, size: file.size,
      storagePath: path, storageUrl: url,
      uploadedByUserId: user.uid, uploaderName: user.profile.name,
      uploadedAt: serverTimestamp(), viewCount: 0, downloadCount: 0,
    }
    const docRef = await addDoc(collection(db, 'files'), record)
    return { id: docRef.id, ...record, uploadedAt: Date.now() }
  },

  async listFiles(classNum, subject) {
    const q = query(
      collection(db, 'files'),
      where('classNum', '==', Number(classNum)),
      where('subject', '==', subject),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map((d) => normalizeFile(d.id, d.data()))
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
  },

  async getFile(id) {
    const snap = await getDoc(doc(db, 'files', id))
    return snap.exists() ? normalizeFile(id, snap.data()) : null
  },

  async allFiles() {
    const snap = await getDocs(collection(db, 'files'))
    return snap.docs
      .map((d) => normalizeFile(d.id, d.data()))
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
  },

  async filesByUploader(userId) {
    const q = query(collection(db, 'files'), where('uploadedByUserId', '==', userId))
    const snap = await getDocs(q)
    return snap.docs
      .map((d) => normalizeFile(d.id, d.data()))
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
  },

  async getFileUrl(record) {
    return record.storageUrl
  },

  async registerView(id) {
    try { await updateDoc(doc(db, 'files', id), { viewCount: increment(1) }) } catch {}
  },

  async registerDownload(id) {
    try { await updateDoc(doc(db, 'files', id), { downloadCount: increment(1) }) } catch {}
  },

  async deleteFile(record, admin) {
    try { await deleteObject(storageRef(storage, record.storagePath)) } catch (e) {
      console.warn('storage delete failed', e)
    }
    await deleteDoc(doc(db, 'files', record.id))
    // Close any open reports pointing at the removed file.
    const q = query(collection(db, 'reports'), where('fileId', '==', record.id), where('status', '==', 'open'))
    const snap = await getDocs(q)
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { status: 'resolved' })))
    await writeAudit(admin, `Deleted file "${record.fileName}" (Class ${record.classNum} · ${record.subject})`, { targetFileId: record.id })
  },

  async moveFile(record, { classNum, subject }, admin) {
    await updateDoc(doc(db, 'files', record.id), { classNum: Number(classNum), subject })
    await writeAudit(admin, `Moved file "${record.fileName}" from Class ${record.classNum} · ${record.subject} to Class ${classNum} · ${subject}`, { targetFileId: record.id })
  },

  // --- Bookmarks -----------------------------------------------------------
  async listBookmarkIds(userId) {
    const snap = await getDocs(collection(db, 'bookmarks', userId, 'items'))
    return snap.docs.map((d) => d.id)
  },

  async toggleBookmark(userId, fileId) {
    const ref = doc(db, 'bookmarks', userId, 'items', fileId)
    const snap = await getDoc(ref)
    if (snap.exists()) { await deleteDoc(ref); return false }
    await setDoc(ref, { savedAt: serverTimestamp() })
    return true
  },

  // --- Reports -------------------------------------------------------------
  async createReport({ file, user, reason }) {
    await addDoc(collection(db, 'reports'), {
      fileId: file.id, fileName: file.fileName,
      classNum: file.classNum, subject: file.subject,
      reportedByUserId: user.uid, reporterName: user.profile.name,
      reason: reason.trim(), status: 'open', createdAt: serverTimestamp(),
    })
  },

  async listReports() {
    const snap = await getDocs(collection(db, 'reports'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data(), createdAt: ts(d.data().createdAt) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  },

  async setReportStatus(id, status, admin) {
    const snap = await getDoc(doc(db, 'reports', id))
    await updateDoc(doc(db, 'reports', id), { status })
    await writeAudit(admin, `${status === 'dismissed' ? 'Dismissed' : 'Resolved'} report on "${snap.data()?.fileName}"`, { targetFileId: snap.data()?.fileId })
  },

  // --- Audit ---------------------------------------------------------------
  async listAudit() {
    const snap = await getDocs(collection(db, 'adminAuditLog'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data(), at: ts(d.data().at) }))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
  },

  async logAdminAction(admin, action, extra = {}) {
    await writeAudit(admin, action, extra)
  },
}
