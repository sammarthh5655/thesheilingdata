// ---------------------------------------------------------------------------
// Supabase backend — Auth + Postgres + Storage.
// Active whenever src/supabase-config.js has a real url + anonKey.
// Mirrors the local/Firebase backend API exactly.
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from '../supabase-config.js'
import { slugify } from '../config.js'

const sb = createClient(supabaseConfig.url, supabaseConfig.anonKey)
const BUCKET = 'worksheets'

const ms = (v) => (v ? new Date(v).getTime() : null)

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

function normUser(r) {
  if (!r) return null
  return {
    id: r.id, name: r.name, email: r.email, role: r.role, status: r.status,
    verified: !!r.verified, createdAt: ms(r.created_at), lastLoginAt: ms(r.last_login_at),
  }
}

function normFile(r) {
  if (!r) return null
  return {
    id: r.id, classNum: r.class_num, subject: r.subject, chapter: r.chapter,
    category: r.category || 'worksheet', paperYear: r.paper_year || null,
    fileName: r.file_name, fileType: r.file_type, size: r.size,
    storagePath: r.storage_path, storageUrl: null,
    examType: r.exam_type || null, worksheetNo: r.worksheet_no || null,
    pageCount: r.page_count || 1, pages: Array.isArray(r.pages) ? r.pages : null,
    uploadedByUserId: r.uploaded_by_user_id, uploaderName: r.uploader_name,
    uploadedAt: ms(r.created_at), viewCount: r.view_count, downloadCount: r.download_count,
  }
}

async function logEvent({ userId, email, type, success }) {
  try {
    await sb.from('login_logs').insert({
      user_id: userId || null, email: email || '', type, success, device: deviceInfo(),
    })
  } catch (e) { console.warn('login log failed', e) }
}

async function writeAudit(admin, action, extra = {}) {
  await sb.from('admin_audit_log').insert({
    admin_user_id: admin?.uid || null,
    admin_name: admin?.profile?.name || 'Admin',
    action,
    target_user_id: extra.targetUserId || null,
    target_file_id: extra.targetFileId || null,
  })
}

async function fetchProfile(uid) {
  const { data } = await sb.from('users').select('*').eq('id', uid).maybeSingle()
  return normUser(data)
}

export const supabaseBackend = {
  mode: 'supabase',

  onAuth(cb) {
    let cancelled = false
    const emit = async (session) => {
      if (cancelled) return
      if (!session?.user) { cb(null); return }
      const u = session.user
      let profile = await fetchProfile(u.id)
      if (!profile) {
        // First authenticated appearance after signup (email confirmation ON
        // gives no session at signup, so the row couldn't be inserted then —
        // and RLS blocks an anon insert). Now that auth.uid() is set, create
        // it. This also self-heals accounts whose profile insert failed before.
        const name =
          (u.user_metadata && u.user_metadata.name) ||
          (u.email ? u.email.split('@')[0] : 'Student')
        const { error } = await sb.from('users').insert({
          id: u.id, email: u.email, name, role: 'student', status: 'active',
          verified: !!u.email_confirmed_at, last_login_at: new Date().toISOString(),
        })
        if (error) console.warn('profile ensure failed', error)
        profile = await fetchProfile(u.id)
      } else if (u.email_confirmed_at && !profile.verified) {
        // Keep verified flag in step with Supabase's email confirmation.
        await sb.from('users').update({ verified: true }).eq('id', u.id)
        profile = { ...profile, verified: true }
      }
      cb({ uid: u.id, profile })
    }
    sb.auth.getSession().then(({ data }) => emit(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => emit(session))
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  },

  async refreshAuth() {
    await sb.auth.refreshSession()
  },

  // Supabase access token — sent to the AI endpoint so it can verify the
  // caller is a signed-in user before spending API credits.
  async getAccessToken() {
    const { data } = await sb.auth.getSession()
    return data.session?.access_token || null
  },

  async signUp({ name, email, password }) {
    email = email.trim().toLowerCase()
    // Stash the name in user_metadata so onAuth() can create the profile row
    // on first sign-in even when email confirmation is on (no session yet).
    const { data, error } = await sb.auth.signUp({
      email, password, options: { data: { name: name.trim() } },
    })
    if (error) {
      await logEvent({ email, type: 'signup', success: false })
      throw new Error(error.message)
    }
    const uid = data.user.id
    // Only insert now if confirmation is OFF (a session exists). With
    // confirmation ON there is no session and RLS would reject an anon insert;
    // onAuth() creates the row when the user first signs in instead.
    if (data.session) {
      const { error: pErr } = await sb.from('users').insert({
        id: uid, email, name: name.trim(), role: 'student', status: 'active',
        verified: !!data.user.email_confirmed_at, last_login_at: new Date().toISOString(),
      })
      if (pErr) console.warn('profile insert', pErr)
    }
    await logEvent({ userId: uid, email, type: 'signup', success: true })
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      await logEvent({ email, type: 'login', success: false })
      throw new Error('Incorrect email or password.')
    }
    const profile = await fetchProfile(data.user.id)
    if (profile?.status === 'banned') {
      await logEvent({ userId: data.user.id, email, type: 'login', success: false })
      await sb.auth.signOut()
      throw new Error('This account has been suspended. Contact your school administrator.')
    }
    await sb.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id)
    await logEvent({ userId: data.user.id, email, type: 'login', success: true })
  },

  async signInWithGoogle() {
    throw new Error('Google sign-in is not enabled.')
  },

  async signOutUser() {
    await sb.auth.signOut()
  },

  async resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  },

  async resendVerification() {
    const { data } = await sb.auth.getUser()
    if (!data.user) throw new Error('Not signed in.')
    const { error } = await sb.auth.resend({ type: 'signup', email: data.user.email })
    if (error) throw new Error(error.message)
  },

  async simulateVerify() {
    throw new Error('Not available — use the verification link emailed to you.')
  },

  async reloadVerification() {
    const { data } = await sb.auth.getUser()
    if (!data.user) return false
    if (data.user.email_confirmed_at) {
      await sb.from('users').update({ verified: true }).eq('id', data.user.id)
      return true
    }
    return false
  },

  async updateName(name) {
    const { data } = await sb.auth.getUser()
    if (!data.user) return
    await sb.from('users').update({ name: name.trim() }).eq('id', data.user.id)
  },

  async changePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  },

  // --- Users ---------------------------------------------------------------
  async getUser(id) {
    return fetchProfile(id)
  },

  async listUsers() {
    const { data } = await sb.from('users').select('*').order('created_at', { ascending: false })
    return (data || []).map(normUser)
  },

  async setRole(id, role, admin) {
    const target = await this.getUser(id)
    await sb.from('users').update({ role }).eq('id', id)
    await writeAudit(admin, `Changed role of ${target?.name} (${target?.email}) from ${target?.role} to ${role}`, { targetUserId: id })
  },

  async setStatus(id, status, admin) {
    const target = await this.getUser(id)
    await sb.from('users').update({ status }).eq('id', id)
    await writeAudit(admin, `${status === 'banned' ? 'Suspended' : 'Reinstated'} account of ${target?.name} (${target?.email})`, { targetUserId: id })
  },

  async listLoginLogs() {
    const { data } = await sb.from('login_logs').select('*').order('created_at', { ascending: false })
    return (data || []).map((r) => ({
      id: r.id, userId: r.user_id, email: r.email, type: r.type,
      success: r.success, device: r.device, at: ms(r.created_at),
    }))
  },

  // --- Files ---------------------------------------------------------------
  async uploadFile({
    classNum, subject, chapter, file, files, user, fileType, category, paperYear,
    examType, worksheetNo,
  }) {
    // `files` holds every page in order; `file` is the single-file shorthand.
    const list = (files && files.length ? files : [file]).filter(Boolean)
    if (!list.length) throw new Error('No file to upload.')

    const uploaded = []
    for (const f of list) {
      const path = `class-${classNum}/${slugify(subject)}/${crypto.randomUUID()}-${f.name}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, f, {
        contentType: f.type || 'application/octet-stream',
      })
      if (upErr) {
        // Don't leave half an upload behind if a later page fails.
        if (uploaded.length) {
          try { await sb.storage.from(BUCKET).remove(uploaded.map((p) => p.path)) } catch { /* best effort */ }
        }
        throw new Error(upErr.message)
      }
      uploaded.push({ path, name: f.name, size: f.size })
    }

    const first = list[0]
    const { data, error } = await sb.from('files').insert({
      class_num: Number(classNum), subject, chapter: chapter.trim(),
      category: category || 'worksheet', paper_year: paperYear || null,
      exam_type: examType || null, worksheet_no: worksheetNo || null,
      file_name: first.name, file_type: fileType,
      size: list.reduce((n, f) => n + (f.size || 0), 0),
      storage_path: uploaded[0].path,
      page_count: uploaded.length,
      pages: uploaded.length > 1 ? uploaded : null,
      uploaded_by_user_id: user.uid, uploader_name: user.profile.name,
      view_count: 0, download_count: 0,
    }).select().single()
    if (error) {
      try { await sb.storage.from(BUCKET).remove(uploaded.map((p) => p.path)) } catch { /* best effort */ }
      throw new Error(error.message)
    }
    return normFile(data)
  },

  async listFiles(classNum, subject, category = 'worksheet') {
    const { data } = await sb.from('files').select('*')
      .eq('class_num', Number(classNum)).eq('subject', subject)
      .order('created_at', { ascending: false })
    return (data || []).map(normFile).filter((f) => f.category === category)
  },

  async getFile(id) {
    const { data } = await sb.from('files').select('*').eq('id', id).maybeSingle()
    return normFile(data)
  },

  async allFiles() {
    const { data } = await sb.from('files').select('*').order('created_at', { ascending: false })
    return (data || []).map(normFile)
  },

  async filesByUploader(userId) {
    const { data } = await sb.from('files').select('*')
      .eq('uploaded_by_user_id', userId).order('created_at', { ascending: false })
    return (data || []).map(normFile)
  },

  async getFileUrl(record) {
    const { data } = sb.storage.from(BUCKET).getPublicUrl(record.storagePath)
    return data.publicUrl
  },

  // Public URLs for every page, in order. Single-page files return one URL.
  async getPageUrls(record) {
    const paths = record.pages?.length
      ? record.pages.map((p) => p.path)
      : [record.storagePath]
    return paths.map((p) => sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl)
  },

  async registerView(id) {
    await sb.rpc('increment_file_counter', { p_file_id: id, p_column: 'view_count' })
      .then(({ error }) => { if (error) return this._bumpFallback(id, 'view_count') })
      .catch(() => this._bumpFallback(id, 'view_count'))
  },

  async registerDownload(id) {
    await sb.rpc('increment_file_counter', { p_file_id: id, p_column: 'download_count' })
      .then(({ error }) => { if (error) return this._bumpFallback(id, 'download_count') })
      .catch(() => this._bumpFallback(id, 'download_count'))
  },

  // Fallback if the RPC helper isn't installed: read-then-write.
  async _bumpFallback(id, col) {
    const { data } = await sb.from('files').select(col).eq('id', id).maybeSingle()
    if (data) await sb.from('files').update({ [col]: (data[col] || 0) + 1 }).eq('id', id)
  },

  async deleteFile(record, admin) {
    const paths = record.pages?.length
      ? record.pages.map((p) => p.path)
      : [record.storagePath]
    try { await sb.storage.from(BUCKET).remove(paths) } catch (e) { console.warn(e) }
    await sb.from('files').delete().eq('id', record.id)
    await sb.from('reports').update({ status: 'resolved' }).eq('file_id', record.id).eq('status', 'open')
    await writeAudit(admin, `Deleted file "${record.fileName}" (Class ${record.classNum} · ${record.subject})`, { targetFileId: record.id })
  },

  async moveFile(record, { classNum, subject }, admin) {
    await sb.from('files').update({ class_num: Number(classNum), subject }).eq('id', record.id)
    await writeAudit(admin, `Moved file "${record.fileName}" from Class ${record.classNum} · ${record.subject} to Class ${classNum} · ${subject}`, { targetFileId: record.id })
  },

  // --- Bookmarks -----------------------------------------------------------
  async listBookmarkIds(userId) {
    const { data } = await sb.from('bookmarks').select('file_id').eq('user_id', userId)
    return (data || []).map((r) => r.file_id)
  },

  async toggleBookmark(userId, fileId) {
    const { data } = await sb.from('bookmarks').select('id').eq('user_id', userId).eq('file_id', fileId).maybeSingle()
    if (data) { await sb.from('bookmarks').delete().eq('id', data.id); return false }
    await sb.from('bookmarks').insert({ user_id: userId, file_id: fileId })
    return true
  },

  // --- Reports -------------------------------------------------------------
  async createReport({ file, user, reason }) {
    await sb.from('reports').insert({
      file_id: file.id, file_name: file.fileName, class_num: file.classNum, subject: file.subject,
      reported_by_user_id: user.uid, reporter_name: user.profile.name,
      reason: reason.trim(), status: 'open',
    })
  },

  async listReports() {
    const { data } = await sb.from('reports').select('*').order('created_at', { ascending: false })
    return (data || []).map((r) => ({
      id: r.id, fileId: r.file_id, fileName: r.file_name, classNum: r.class_num,
      subject: r.subject, reportedByUserId: r.reported_by_user_id, reporterName: r.reporter_name,
      reason: r.reason, status: r.status, createdAt: ms(r.created_at),
    }))
  },

  async setReportStatus(id, status, admin) {
    const { data } = await sb.from('reports').select('file_name, file_id').eq('id', id).maybeSingle()
    await sb.from('reports').update({ status }).eq('id', id)
    await writeAudit(admin, `${status === 'dismissed' ? 'Dismissed' : 'Resolved'} report on "${data?.file_name}"`, { targetFileId: data?.file_id })
  },

  // --- Audit ---------------------------------------------------------------
  async listAudit() {
    const { data } = await sb.from('admin_audit_log').select('*').order('created_at', { ascending: false })
    return (data || []).map((r) => ({
      id: r.id, adminUserId: r.admin_user_id, adminName: r.admin_name,
      action: r.action, at: ms(r.created_at),
    }))
  },

  async logAdminAction(admin, action, extra = {}) {
    await writeAudit(admin, action, extra)
  },
}
